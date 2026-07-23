/**
 * Dedicated Worker hosting an in-browser Whisper ASR pipeline (transformers.js).
 *
 * Conceptually inspired by the subvid.app Whisper worker (see subtitler/ in this
 * repo) but written independently: own message protocol, own naming, own
 * structure. Two things carried over deliberately because they're hard-won
 * cross-browser fixes, not stylistic choices:
 *  - dtype 'fp32' forced on the ASR pipeline (quantized q4/q8 ONNX Whisper
 *    models throw on Firefox and on Chrome without WebGPU)
 *  - env.useBrowserCache = true, so downloaded model weights persist in the
 *    Cache API across sessions (see composables/useModelCache.ts)
 */
import { pipeline, env } from '@huggingface/transformers'
import type { AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'

env.allowLocalModels = false
env.useBrowserCache = true

type InboundMessage =
  | { requestId: number; kind: 'prepare-model'; payload: { modelId: string } }
  | {
      requestId: number
      kind: 'run-transcription'
      payload: { pcm: Float32Array; language?: string; timestampGranularity: 'segment' | 'word' }
    }

type OutboundMessage =
  | { kind: 'model-progress'; payload: { progress: number; file: string; status: string } }
  | { kind: 'segment-progress' }
  | { requestId: number; kind: 'result'; payload: TranscriptionResult }
  | { requestId: number; kind: 'failure'; payload: { message: string } }

export interface TranscriptionChunk {
  text: string
  timestamp: [number, number | null]
}

export interface TranscriptionResult {
  text: string
  chunks: TranscriptionChunk[]
  language?: string
}

let recognizer: AutomaticSpeechRecognitionPipeline | null = null
let recognizerModelId: string | null = null

function post(message: OutboundMessage) {
  ;(self as unknown as Worker).postMessage(message)
}

async function ensureRecognizer(modelId: string): Promise<AutomaticSpeechRecognitionPipeline> {
  if (recognizer && recognizerModelId === modelId) return recognizer

  recognizer = await pipeline('automatic-speech-recognition', modelId, {
    dtype: 'fp32',
    progress_callback: (progress: any) => {
      post({
        kind: 'model-progress',
        payload: {
          progress: progress.progress ?? 0,
          file: progress.file ?? modelId,
          status: progress.status ?? 'progress',
        },
      })
    },
  })
  recognizerModelId = modelId
  return recognizer
}

async function runTranscription(
  pcm: Float32Array,
  language: string | undefined,
  timestampGranularity: 'segment' | 'word'
): Promise<TranscriptionResult> {
  if (!recognizer) throw new Error('Whisper model not prepared — call prepare-model first')

  const output: any = await recognizer(pcm, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: timestampGranularity === 'word' ? 'word' : true,
    language: language || null,
    chunk_callback: () => post({ kind: 'segment-progress' }),
  })

  return {
    text: output.text ?? '',
    chunks: (output.chunks ?? []).map((c: any) => ({ text: c.text, timestamp: c.timestamp })),
    language: output.language,
  }
}

self.onmessage = async (event: MessageEvent<InboundMessage>) => {
  const message = event.data

  try {
    if (message.kind === 'prepare-model') {
      await ensureRecognizer(message.payload.modelId)
      post({ requestId: message.requestId, kind: 'result', payload: { text: '', chunks: [] } })
      return
    }

    if (message.kind === 'run-transcription') {
      const result = await runTranscription(
        message.payload.pcm,
        message.payload.language,
        message.payload.timestampGranularity
      )
      post({ requestId: message.requestId, kind: 'result', payload: result })
      return
    }
  } catch (error) {
    post({
      requestId: message.requestId,
      kind: 'failure',
      payload: { message: error instanceof Error ? error.message : String(error) },
    })
  }
}
