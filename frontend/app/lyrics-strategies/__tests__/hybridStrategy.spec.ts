import { describe, expect, it } from 'vitest'
import { alignKnownLinesToAsr } from '~/lyrics-strategies/hybridStrategy'
import { refineLineWordTimings } from '~/lyrics-strategies/wordAlignment'
import type { TranscriptionChunk } from '~/workers/whisperTranscriber.worker'

/** One chunk per character, `msPerChar` apart, spoken back-to-back starting at t=0. */
function chunksFor(text: string, msPerChar: number): TranscriptionChunk[] {
  return text.split('').map((char, i) => ({
    text: char,
    timestamp: [(i * msPerChar) / 1000, ((i + 1) * msPerChar) / 1000],
  }))
}

describe('alignKnownLinesToAsr', () => {
  it('maps a repeated chorus to its own distinct ASR occurrence, not the first one', () => {
    const asrChunks = chunksFor('abXYab', 100) // "ab", verse "XY", "ab" again — heard in full
    const { lines } = alignKnownLinesToAsr(['ab', 'XY', 'ab'], asrChunks)

    expect(lines[0]).toMatchObject({ start_time_ms: 0, end_time_ms: 200 })
    expect(lines[1]).toMatchObject({ start_time_ms: 200, end_time_ms: 400 })
    // The second "ab" must land on its own real occurrence (400-600ms), not collapse onto
    // the first one's timing (0-200ms).
    expect(lines[2]).toMatchObject({ start_time_ms: 400, end_time_ms: 600 })
  })

  it('recovers exactly right after a verse ASR missed entirely — no permanent drift for the rest of the song', () => {
    // ASR only heard "abcdef" — the 10-char verse between "ab" and "cd" was never transcribed
    // (e.g. Whisper dropped it, or it's an ad-lib absent from the model's output).
    const asrChunks = chunksFor('abcdef', 100)
    const { lines } = alignKnownLinesToAsr(['ab', 'PPPPPPPPPP', 'cd', 'ef'], asrChunks)

    // Prefix is untouched by the gap that comes after it.
    expect(lines[0]).toMatchObject({ start_time_ms: 0, end_time_ms: 200 })

    // Right after the missed verse, timing snaps back to the real ASR anchors exactly —
    // with the old global-proportional-scale approach this would have stayed permanently
    // offset (that approach would have put "cd" at ~450-525ms and "ef" at ~525-600ms,
    // instead of the real 300-400ms / 400-600ms respectively).
    expect(lines[2]!.end_time_ms).toBe(400)
    expect(lines[3]).toMatchObject({ start_time_ms: 400, end_time_ms: 600 })
  })

  it('combined with refineLineWordTimings, snaps a line boundary to the ASR word that actually produced it', () => {
    // The reported failure shape: a mis-heard word ("ZQ" heard for reference "XY") sits right
    // at the boundary between two reference lines — the char-level pass alone can only
    // interpolate through it, but the word-level pass should snap the boundary to the real
    // ASR word edge once alignKnownLinesToAsr's output is refined.
    const asrChunks: TranscriptionChunk[] = [
      { text: 'ab', timestamp: [0, 0.1] },
      { text: 'ZQ', timestamp: [0.1, 0.3] },
      { text: 'cdef', timestamp: [0.3, 0.5] },
    ]

    const { lines, wordTimingContext } = alignKnownLinesToAsr(['abXY', 'cdef'], asrChunks)
    const refined = refineLineWordTimings(
      lines,
      wordTimingContext.perLineCharOffset,
      asrChunks,
      wordTimingContext.apiCharToTimeMs
    )

    expect(refined.lines[0]).toMatchObject({ start_time_ms: 0, end_time_ms: 300 })
    expect(refined.lines[1]).toMatchObject({ start_time_ms: 300, end_time_ms: 500 })
  })
})
