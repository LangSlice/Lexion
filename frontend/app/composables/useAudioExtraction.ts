/**
 * Extracts mono 16kHz PCM audio (Whisper's expected input format) from an
 * arbitrary audio/video byte blob, in the browser, via ffmpeg.wasm.
 *
 * Own implementation of a pattern also used in subtitler/ (ffmpeg.wasm →
 * mono 16kHz WAV → hand-parsed Float32Array, with an AudioContext fallback
 * for WAV bodies the manual parser can't handle) — independently written.
 */
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

const FFMPEG_CORE_VERSION = '0.12.10'
const FFMPEG_CORE_BASE = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`
const TARGET_SAMPLE_RATE = 16000

let ffmpegSingleton: FFmpeg | null = null
let ffmpegLoadPromise: Promise<FFmpeg> | null = null

async function loadFfmpeg(onProgress?: (ratio: number) => void): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton
  if (ffmpegLoadPromise) return ffmpegLoadPromise

  ffmpegLoadPromise = (async () => {
    const ffmpeg = new FFmpeg()
    if (onProgress) {
      ffmpeg.on('progress', ({ progress }) => onProgress(progress))
    }
    await ffmpeg.load({
      coreURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    ffmpegSingleton = ffmpeg
    return ffmpeg
  })()

  return ffmpegLoadPromise
}

/** Walks a WAV file's RIFF chunks and decodes a PCM16 `data` chunk to Float32Array */
function decodeWavPcm16(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, false) !== 0x52494646 /* 'RIFF' */ || view.getUint32(8, false) !== 0x57415645 /* 'WAVE' */) {
    throw new Error('Not a RIFF/WAVE file')
  }

  let offset = 12
  let dataOffset = -1
  let dataLength = 0
  let bitsPerSample = 16
  let audioFormat = 1

  while (offset + 8 <= view.byteLength) {
    const chunkId = view.getUint32(offset, false)
    const chunkSize = view.getUint32(offset + 4, true)
    const chunkBodyOffset = offset + 8

    if (chunkId === 0x666d7420 /* 'fmt ' */) {
      audioFormat = view.getUint16(chunkBodyOffset, true)
      bitsPerSample = view.getUint16(chunkBodyOffset + 14, true)
    } else if (chunkId === 0x64617461 /* 'data' */) {
      dataOffset = chunkBodyOffset
      dataLength = chunkSize
    }

    offset = chunkBodyOffset + chunkSize + (chunkSize % 2)
  }

  if (dataOffset < 0) throw new Error('WAV file has no data chunk')
  if (audioFormat !== 1 || bitsPerSample !== 16) throw new Error('Only PCM16 WAV is supported by the fast parser')

  const sampleCount = dataLength / 2
  const samples = new Float32Array(sampleCount)
  for (let i = 0; i < sampleCount; i++) {
    samples[i] = view.getInt16(dataOffset + i * 2, true) / 32768
  }
  return samples
}

async function decodeViaAudioContext(bytes: Uint8Array): Promise<Float32Array> {
  const audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
  try {
    const buffer = await audioContext.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
    return buffer.getChannelData(0)
  } finally {
    await audioContext.close()
  }
}

export function useAudioExtraction() {
  async function extractMonoPcm16kFromAudioBytes(
    bytes: Uint8Array,
    inputExtension: string,
    onProgress?: (ratio: number) => void
  ): Promise<Float32Array> {
    const ffmpeg = await loadFfmpeg(onProgress)

    const inputName = `input.${inputExtension}`
    const outputName = 'output.wav'
    await ffmpeg.writeFile(inputName, await fetchFile(new Blob([bytes])))
    await ffmpeg.exec(['-i', inputName, '-vn', '-ac', '1', '-ar', String(TARGET_SAMPLE_RATE), '-f', 'wav', outputName])
    const wavBytes = (await ffmpeg.readFile(outputName)) as Uint8Array

    await ffmpeg.deleteFile(inputName).catch(() => {})
    await ffmpeg.deleteFile(outputName).catch(() => {})

    try {
      return decodeWavPcm16(wavBytes)
    } catch (error) {
      console.warn('Fast WAV parse failed, falling back to AudioContext.decodeAudioData', error)
      return decodeViaAudioContext(wavBytes)
    }
  }

  return { extractMonoPcm16kFromAudioBytes, targetSampleRate: TARGET_SAMPLE_RATE }
}
