/**
 * ASR strategy: pure in-browser Whisper transcription, no external lyrics
 * dependency. Real, audio-derived timestamps at the cost of transcription
 * risk on stylized/fast vocals and no coverage of non-sung content.
 *
 * Requests word-level ASR granularity and regroups the resulting word-chunk
 * stream into display-sized lines itself (silence gaps + word/char/duration
 * caps, similar in spirit to subtitler/'s line-segmentation heuristic but
 * independently tuned) — unlike hybrid, there's no separately-verified lyric
 * text to align against, the ASR transcript itself IS the source text, so
 * word-level timing here is a direct breakpoint lookup (no forced alignment
 * needed — the transcript is trivially "aligned" with itself).
 */
import { fileExtension } from '~/utils/fileHash'
import { useAudioExtraction } from '~/composables/useAudioExtraction'
import { useWhisperClient } from '~/composables/useWhisperClient'
import { snapSegmentsToSpeechRuns, computeSpeechRuns } from '~/lyrics-strategies/audioSpeechRuns'
import { buildAsrBreakpoints, stripWhitespace, timeAtCharPosition } from '~/lyrics-strategies/charPositionAlignment'
import type { DraftLyricLine, LyricsStrategy, LyricsStrategyInput, LyricsStrategyResult, WordTimingContext } from '~/types/lyricsStrategy'
import type { TranscriptionChunk } from '~/workers/whisperTranscriber.worker'

/** Silence gap that starts a new line — tuning knob, ballpark-matched to subtitler's 0.55s. */
const SILENCE_BREAK_MS = 550
const MAX_LINE_WORDS = 10
const MAX_LINE_CHARS = 40
const MAX_LINE_DURATION_MS = 6000

interface WordChunkGroup {
  line: DraftLyricLine
  chunks: TranscriptionChunk[]
}

/**
 * Segments a flat word-chunk stream into line-level groups: breaks on a silence
 * gap, or when the accumulating line would exceed a word/char/duration cap.
 * `words` must already be pre-filtered to non-blank chunks (chunksToBreakpoints
 * needs the exact same filtered sequence to stay char-offset-aligned with this).
 */
function groupWordChunksIntoLines(words: TranscriptionChunk[]): WordChunkGroup[] {
  const groups: WordChunkGroup[] = []
  let current: TranscriptionChunk[] = []

  function flush() {
    const first = current[0]
    const last = current.at(-1)
    if (!first || !last) return

    const startMs = Math.round(first.timestamp[0] * 1000)
    const endSeconds = last.timestamp[1] ?? last.timestamp[0] + 0.3
    const endMs = Math.max(Math.round(endSeconds * 1000), startMs + 1)
    const text = current
      .map((c) => c.text.trim())
      .join(' ')
      .trim()

    groups.push({ line: { start_time_ms: startMs, end_time_ms: endMs, text }, chunks: current })
    current = []
  }

  for (const chunk of words) {
    const prev = current.at(-1)
    const first = current[0]

    if (prev && first) {
      const prevEndMs = (prev.timestamp[1] ?? prev.timestamp[0] + 0.3) * 1000
      const gapMs = chunk.timestamp[0] * 1000 - prevEndMs
      const candidateText = [...current, chunk].map((c) => c.text.trim()).join(' ')
      const durationMs = chunk.timestamp[0] * 1000 - first.timestamp[0] * 1000

      const shouldBreak =
        gapMs > SILENCE_BREAK_MS ||
        current.length + 1 > MAX_LINE_WORDS ||
        candidateText.length > MAX_LINE_CHARS ||
        durationMs > MAX_LINE_DURATION_MS

      if (shouldBreak) flush()
    }

    current.push(chunk)
  }
  flush()

  return groups
}

/** Builds the char-to-time timeline (direct breakpoint lookup) plus each line's own starting char offset into it. */
function buildWordTimingContext(words: TranscriptionChunk[], groups: WordChunkGroup[]): WordTimingContext {
  const { text, breakpoints } = buildAsrBreakpoints(words)

  let cursor = 0
  const perLineCharOffset: number[] = []
  for (const group of groups) {
    perLineCharOffset.push(cursor)
    cursor += group.chunks.reduce((sum, c) => sum + stripWhitespace(c.text).length, 0)
  }

  const apiCharToTimeMs = Array.from({ length: text.length + 1 }, (_, pos) => Math.round(timeAtCharPosition(breakpoints, pos)))

  return { apiCharToTimeMs, perLineCharOffset }
}

export const asrStrategy: LyricsStrategy = {
  id: 'asr',
  label: 'Transcribe (Whisper)',
  description: 'Transcribes the song directly from audio, in your browser. No external lyrics needed; timestamps come from the audio itself.',
  requiresAudio: true,
  requiresLyricsFetch: false,

  async run(input: LyricsStrategyInput): Promise<LyricsStrategyResult> {
    if (!input.uploadedAudio) {
      throw new Error('ASR strategy requires an uploaded audio/video file — none was attached to this song.')
    }
    const { extractMonoPcm16kFromAudioBytes, targetSampleRate } = useAudioExtraction()
    const whisper = useWhisperClient()

    input.onProgress?.('extracting-audio', 10, 'Reading uploaded file...')
    const bytes = new Uint8Array(await input.uploadedAudio.file.arrayBuffer())
    const extension = fileExtension(input.uploadedAudio.file.name)

    input.onProgress?.('extracting-audio', 25, 'Extracting audio for transcription...')
    const pcm = await extractMonoPcm16kFromAudioBytes(bytes, extension, (ratio) =>
      input.onProgress?.('extracting-audio', 25 + ratio * 15, 'Extracting audio for transcription...')
    )

    input.onProgress?.('transcribing', 45, 'Loading Whisper model...')
    await whisper.prepareModel((progress) =>
      input.onProgress?.('transcribing', 45 + progress.progress * 0.2, `Downloading model: ${progress.file}`)
    )

    input.onProgress?.('transcribing', 65, 'Transcribing...')
    const result = await whisper.transcribe(pcm, { language: input.sourceLanguage, timestampGranularity: 'word' })

    const words = result.chunks.filter((c) => c.text.trim())
    const groups = groupWordChunksIntoLines(words)
    const draftLines = groups.map((g) => g.line)
    const wordTimingContext = buildWordTimingContext(words, groups)

    input.onProgress?.('aligning', 85, 'Refining timing against detected speech...')
    const speechRuns = computeSpeechRuns(pcm, targetSampleRate)
    const refinedLines = snapSegmentsToSpeechRuns(draftLines, speechRuns)

    return {
      lines: refinedLines,
      lyricsSource: 'asr',
      lyricsLanguageHint: result.language,
      wordTimingContext,
    }
  },
}
