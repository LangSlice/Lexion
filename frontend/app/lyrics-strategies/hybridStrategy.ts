/**
 * Hybrid strategy: known-good lyric text (Musixmatch, same source as
 * Legacy) combined with in-browser Whisper word-level timestamps, aligned via
 * a real character-level forced alignment (Needleman-Wunsch global DP, see
 * `sequenceAlignment.ts`) rather than a naive proportional stretch — mismatches
 * between ASR and API text (mis-heard words, missed verses) self-correct at
 * the next matching anchor instead of desyncing every line after them.
 * Finished with the same speech-run snap ASR uses, for tighter boundaries.
 *
 * The resulting char-to-time timeline is carried forward (as `wordTimingContext`)
 * so useLyricsPipeline can additionally resolve real per-word timestamps after
 * word-analysis returns breakdown[].
 */
import { fetchLyricsOnly } from '~/services/songApi'
import { fileExtension } from '~/utils/fileHash'
import { useAudioExtraction } from '~/composables/useAudioExtraction'
import { useWhisperClient } from '~/composables/useWhisperClient'
import { snapSegmentsToSpeechRuns, computeSpeechRuns } from '~/lyrics-strategies/audioSpeechRuns'
import { buildAsrBreakpoints, stripWhitespace } from '~/lyrics-strategies/charPositionAlignment'
import { buildApiCharTimeline } from '~/lyrics-strategies/sequenceAlignment'
import { refineLineWordTimings } from '~/lyrics-strategies/wordAlignment'
import type { DraftLyricLine, LyricsStrategy, LyricsStrategyInput, LyricsStrategyResult, WordTimingContext } from '~/types/lyricsStrategy'
import type { TranscriptionChunk } from '~/workers/whisperTranscriber.worker'

interface AlignedLines {
  lines: DraftLyricLine[]
  wordTimingContext: WordTimingContext
}

/**
 * Maps each known lyric line onto the ASR word-timestamp stream via a real
 * char-level forced alignment against the full ASR transcript. Also records,
 * per line, its start offset in the known-lyrics char-space — enough for the
 * pipeline to later resolve times at intra-line word boundaries too via the
 * same timeline (see `attachWordTimings` in useLyricsPipeline.ts).
 */
export function alignKnownLinesToAsr(knownLines: string[], asrChunks: TranscriptionChunk[]): AlignedLines {
  const { text: asrText, breakpoints } = buildAsrBreakpoints(asrChunks)

  // Filter blanks by index first, not by re-indexing into the filtered array —
  // otherwise a blank line anywhere would desync every subsequent line/offset.
  const nonBlankIndices = knownLines.flatMap((line, i) => (stripWhitespace(line).length > 0 ? [i] : []))
  const cleanedLines = nonBlankIndices.map((i) => stripWhitespace(knownLines[i]!))
  const knownLyricsText = cleanedLines.join('')

  const apiCharToTimeMs = buildApiCharTimeline(asrText, breakpoints, knownLyricsText)

  const lines: DraftLyricLine[] = []
  const perLineCharOffset: number[] = []
  let knownCursor = 0

  for (let i = 0; i < nonBlankIndices.length; i++) {
    const knownLine = knownLines[nonBlankIndices[i]!]!
    const lineLength = cleanedLines[i]!.length

    lines.push({
      start_time_ms: apiCharToTimeMs[knownCursor] ?? 0,
      end_time_ms: apiCharToTimeMs[knownCursor + lineLength] ?? 0,
      text: knownLine,
    })
    perLineCharOffset.push(knownCursor)

    knownCursor += lineLength
  }

  return { lines, wordTimingContext: { apiCharToTimeMs, perLineCharOffset } }
}

export const hybridStrategy: LyricsStrategy = {
  id: 'hybrid',
  label: 'Hybrid (text + forced alignment)',
  description: 'Uses Musixmatch text for accuracy, aligned to real audio timing via in-browser Whisper. Best of both, slowest to run.',
  requiresAudio: true,
  requiresLyricsFetch: true,

  async run(input: LyricsStrategyInput): Promise<LyricsStrategyResult> {
    if (!input.youtubeId) {
      throw new Error('Hybrid strategy requires a YouTube reference for its Musixmatch lyrics fetch.')
    }
    if (!input.uploadedAudio) {
      throw new Error('Hybrid strategy requires an uploaded audio/video file — none was attached to this song.')
    }
    const { extractMonoPcm16kFromAudioBytes, targetSampleRate } = useAudioExtraction()
    const whisper = useWhisperClient()

    input.onProgress?.('fetching-metadata', 5, 'Fetching known lyrics...')
    const lyricsResult = await fetchLyricsOnly(input.title, input.artist, input.youtubeId, input.sourceLanguage)

    input.onProgress?.('extracting-audio', 15, 'Reading uploaded file...')
    const bytes = new Uint8Array(await input.uploadedAudio.file.arrayBuffer())
    const extension = fileExtension(input.uploadedAudio.file.name)

    input.onProgress?.('extracting-audio', 30, 'Extracting audio for transcription...')
    const pcm = await extractMonoPcm16kFromAudioBytes(bytes, extension, (ratio) =>
      input.onProgress?.('extracting-audio', 30 + ratio * 15, 'Extracting audio for transcription...')
    )

    input.onProgress?.('transcribing', 50, 'Loading Whisper model...')
    await whisper.prepareModel((progress) =>
      input.onProgress?.('transcribing', 50 + progress.progress * 0.15, `Downloading model: ${progress.file}`)
    )

    input.onProgress?.('transcribing', 65, 'Transcribing for alignment reference...')
    const result = await whisper.transcribe(pcm, { language: input.sourceLanguage, timestampGranularity: 'word' })

    input.onProgress?.('aligning', 80, 'Aligning known lyrics to audio timing...')
    const { lines: alignedLines, wordTimingContext } = alignKnownLinesToAsr(lyricsResult.lines, result.chunks)

    input.onProgress?.('aligning', 85, 'Refining word-level timing...')
    const wordRefined = refineLineWordTimings(
      alignedLines,
      wordTimingContext.perLineCharOffset,
      result.chunks,
      wordTimingContext.apiCharToTimeMs
    )
    wordTimingContext.apiCharToTimeMs = wordRefined.apiCharToTimeMs

    const speechRuns = computeSpeechRuns(pcm, targetSampleRate)
    const refinedLines = snapSegmentsToSpeechRuns(wordRefined.lines, speechRuns)

    return {
      lines: refinedLines,
      lyricsSource: lyricsResult.source as LyricsStrategyResult['lyricsSource'],
      lyricsLanguageHint: lyricsResult.format,
      lyricsConfidence: lyricsResult.confidence,
      wordTimingContext,
    }
  },
}
