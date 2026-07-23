import { describe, expect, it } from 'vitest'
import { isSectionMarker, refineLineWordTimings } from '~/lyrics-strategies/wordAlignment'
import { buildAsrBreakpoints } from '~/lyrics-strategies/charPositionAlignment'
import { buildApiCharTimeline } from '~/lyrics-strategies/sequenceAlignment'
import type { DraftLyricLine } from '~/types/lyricsStrategy'
import type { TranscriptionChunk } from '~/workers/whisperTranscriber.worker'

function wordChunk(text: string, startMs: number, endMs: number): TranscriptionChunk {
  return { text, timestamp: [startMs / 1000, endMs / 1000] }
}

/** Builds the same coarse (char-level-only) timeline/lines alignKnownLinesToAsr would produce,
 *  so tests can assert refineLineWordTimings changed exactly what it should and nothing else. */
function coarseBaseline(chunks: TranscriptionChunk[], lineTexts: string[]) {
  const { text: asrText, breakpoints } = buildAsrBreakpoints(chunks)
  const knownLyricsText = lineTexts.join('')
  const apiCharToTimeMs = buildApiCharTimeline(asrText, breakpoints, knownLyricsText)

  const perLineCharOffset: number[] = []
  const lines: DraftLyricLine[] = []
  let cursor = 0
  for (const text of lineTexts) {
    perLineCharOffset.push(cursor)
    lines.push({ start_time_ms: apiCharToTimeMs[cursor]!, end_time_ms: apiCharToTimeMs[cursor + text.length]!, text })
    cursor += text.length
  }

  return { apiCharToTimeMs, perLineCharOffset, lines }
}

describe('isSectionMarker', () => {
  it('classifies bracketed and bare structural tags as markers', () => {
    expect(isSectionMarker('[Chorus]')).toBe(true)
    expect(isSectionMarker('[VERSE 2]')).toBe(true)
    expect(isSectionMarker('Chorus')).toBe(true)
    expect(isSectionMarker('Chorus x2')).toBe(true)
    expect(isSectionMarker('Bridge')).toBe(true)
  })

  it('does not classify real lyric lines as markers, even near-misses', () => {
    expect(isSectionMarker('dareka ga egaita sutēji')).toBe(false)
    expect(isSectionMarker('Chorus of angels singing')).toBe(false)
    expect(isSectionMarker('')).toBe(false)
  })
})

describe('refineLineWordTimings', () => {
  it("divides a mis-heard ASR word's time proportionally across the reference chars it replaced", () => {
    // ASR heard "ab" + "ZQ" (one word, mis-heard for reference "XY") + "cdef".
    const chunks = [wordChunk('ab', 0, 100), wordChunk('ZQ', 100, 300), wordChunk('cdef', 300, 500)]
    const lines = ['abXY', 'cdef']
    const { apiCharToTimeMs, perLineCharOffset, lines: draftLines } = coarseBaseline(chunks, lines)

    const result = refineLineWordTimings(draftLines, perLineCharOffset, chunks, apiCharToTimeMs)

    // "ab" is a pure match, anchored at the end of that ASR word.
    expect(result.apiCharToTimeMs[2]).toBe(100)
    // "X" and "Y" are both attributed to the single mis-heard ASR word "ZQ" (100-300ms) and
    // split proportionally within its own span, not smeared to the next real anchor.
    expect(result.apiCharToTimeMs[3]).toBe(200)
    expect(result.apiCharToTimeMs[4]).toBe(300)
    // Line 0's end boundary now snaps to the ASR word's own edge.
    expect(result.lines[0]!.end_time_ms).toBe(300)
    expect(result.lines[1]!.start_time_ms).toBe(300)
  })

  it("never attributes a substitution to a marker line, and leaves the marker line's timing untouched", () => {
    // A vocalization ASR picked up during what the reference marks as "[Chorus]" gets
    // heard as "ZZZZZZ" (same length, so the DP aligns it char-for-char as substitutions).
    const chunks = [wordChunk('ab', 0, 100), wordChunk('ZZZZZZ', 100, 300), wordChunk('cd', 300, 400)]
    const lines = ['ab', 'Chorus', 'cd']
    const { apiCharToTimeMs, perLineCharOffset, lines: draftLines } = coarseBaseline(chunks, lines)

    const result = refineLineWordTimings(draftLines, perLineCharOffset, chunks, apiCharToTimeMs)

    // The marker line comes back completely untouched (same object), never used as a
    // substitution target for the "ZZZZZZ" ASR word.
    expect(result.lines[1]).toBe(draftLines[1])
    // Its char range in the timeline is byte-identical to the un-refined coarse pass too.
    expect(result.apiCharToTimeMs.slice(2, 9)).toEqual(apiCharToTimeMs.slice(2, 9))
    // Neighboring real lyric lines are unaffected by the marker exclusion.
    expect(result.lines[0]!).toMatchObject({ start_time_ms: 0, end_time_ms: 100 })
    expect(result.lines[2]!).toMatchObject({ start_time_ms: 300, end_time_ms: 400 })
  })

  it('is a no-op on an already-clean, fully matched alignment', () => {
    const chunks = [wordChunk('ab', 0, 100), wordChunk('cd', 100, 200), wordChunk('ef', 200, 300)]
    const lines = ['ab', 'cd', 'ef']
    const { apiCharToTimeMs, perLineCharOffset, lines: draftLines } = coarseBaseline(chunks, lines)

    const result = refineLineWordTimings(draftLines, perLineCharOffset, chunks, apiCharToTimeMs)

    expect(result.apiCharToTimeMs).toEqual(apiCharToTimeMs)
    expect(result.lines.map((l) => [l.start_time_ms, l.end_time_ms])).toEqual(
      draftLines.map((l) => [l.start_time_ms, l.end_time_ms])
    )
  })
})
