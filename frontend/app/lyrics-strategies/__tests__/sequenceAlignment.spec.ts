import { describe, expect, it } from 'vitest'
import type { CharBreakpoint } from '~/lyrics-strategies/charPositionAlignment'
import { alignSequences, buildApiCharTimeline, normalizeForAlignment } from '~/lyrics-strategies/sequenceAlignment'

/** One breakpoint per character, `msPerChar` apart — deterministic timing for assertions. */
function uniformBreakpoints(text: string, msPerChar: number): CharBreakpoint[] {
  return Array.from({ length: text.length }, (_, i) => ({
    charStart: i,
    charEnd: i + 1,
    timeStartMs: i * msPerChar,
    timeEndMs: (i + 1) * msPerChar,
  }))
}

describe('normalizeForAlignment', () => {
  it('strips punctuation for matching but keeps a 1:1 index back to the original text', () => {
    const { normalized, originalIndex } = normalizeForAlignment('hi、there!')
    expect(normalized).toBe('hithere')
    // 'h','i' at 0,1 ; '、' skipped at 2 ; 't','h','e','r','e' at 3..7 ; '!' skipped at 8
    expect(originalIndex).toEqual([0, 1, 3, 4, 5, 6, 7])
  })

  it('lowercases Latin characters', () => {
    expect(normalizeForAlignment('ABC').normalized).toBe('abc')
  })
})

describe('alignSequences', () => {
  it('produces all-match ops for identical strings', () => {
    const ops = alignSequences('abcdef', 'abcdef')
    expect(ops.every((op) => op.type === 'match')).toBe(true)
    expect(ops).toHaveLength(6)
  })

  it('localizes a single mid-string substitution', () => {
    const ops = alignSequences('abXdef', 'abYdef')
    const types = ops.map((op) => op.type)
    expect(types).toEqual(['match', 'match', 'sub', 'match', 'match', 'match'])
  })

  it('marks an ASR-only filler run as insert, leaving the rest matched', () => {
    // ASR heard extra filler ("uh") that isn't in the API text.
    const ops = alignSequences('abuhcd', 'abcd')
    const types = ops.map((op) => op.type)
    expect(types.filter((t) => t === 'insert')).toHaveLength(2)
    expect(types.filter((t) => t === 'match')).toHaveLength(4)
  })

  it('marks an API-only run (missing from ASR) as delete', () => {
    // API has a verse ASR completely missed.
    const ops = alignSequences('abcd', 'abXYcd')
    const types = ops.map((op) => op.type)
    expect(types.filter((t) => t === 'delete').length).toBeGreaterThanOrEqual(2)
    expect(types.filter((t) => t === 'match')).toHaveLength(4)
  })
})

describe('buildApiCharTimeline', () => {
  it('resolves exact times for a perfect match (regression check vs. old proportional stretch)', () => {
    const asrText = 'abcdef'
    const breakpoints = uniformBreakpoints(asrText, 100)
    const timeline = buildApiCharTimeline(asrText, breakpoints, 'abcdef')

    expect(timeline).toEqual([0, 100, 200, 300, 400, 500, 600])
  })

  it('keeps a mismatch localized: neighbors stay exact, only the mismatched span is interpolated', () => {
    const asrText = 'abXdef'
    const breakpoints = uniformBreakpoints(asrText, 100)
    const timeline = buildApiCharTimeline(asrText, breakpoints, 'abYdef')

    // Prefix "ab" and suffix "def" are pure matches — exact, untouched by the substitution.
    expect(timeline[0]).toBe(0)
    expect(timeline[1]).toBe(100)
    expect(timeline[2]).toBe(200)
    expect(timeline[4]).toBe(400)
    expect(timeline[5]).toBe(500)
    expect(timeline[6]).toBe(600)
  })

  it('interpolates a multi-char substitution strictly between its bounding anchors', () => {
    const asrText = 'abXYcd'
    const breakpoints = uniformBreakpoints(asrText, 100)
    const timeline = buildApiCharTimeline(asrText, breakpoints, 'abZWcd')

    expect(timeline[2]).toBe(200) // end of matched "ab"
    expect(timeline[4]).toBe(400) // start of matched "cd"
    expect(timeline[3]).toBe(300) // midpoint of the substituted run, not clamped to either edge
  })

  it('does not let a dropped-mora near-miss (e.g. "imagi" heard for "image") desync what follows it', () => {
    // ASR drops one kana; API has the correct (longer) word. Prefix/suffix must stay anchored.
    const asrText = 'まえイマジあと'
    const apiText = 'まえイメージあと'
    const breakpoints = uniformBreakpoints(asrText, 100)
    const timeline = buildApiCharTimeline(asrText, breakpoints, apiText)

    // Prefix "まえ" (2 chars) is an exact anchor regardless of the mismatch that follows.
    expect(timeline[0]).toBe(0)
    expect(timeline[1]).toBe(100)
    expect(timeline[2]).toBe(200)

    // Suffix "あと" (last 2 chars of both strings) is an exact anchor too — the mismatched,
    // length-differing middle segment does not push the tail out of sync.
    const apiLength = apiText.length
    const asrLength = asrText.length
    expect(timeline[apiLength - 1]).toBe((asrLength - 1) * 100)
    expect(timeline[apiLength]).toBe(asrLength * 100)
  })

  it('skips ASR filler/hallucination without corrupting neighboring anchors', () => {
    const asrText = 'abuhcd'
    const breakpoints = uniformBreakpoints(asrText, 100)
    const timeline = buildApiCharTimeline(asrText, breakpoints, 'abcd')

    // "ab" matches asr[0..2), "cd" matches asr[4..6) — the "uh" filler (asr[2..4)) is skipped,
    // not stretched across the whole known-lyrics text.
    expect(timeline[0]).toBe(0)
    expect(timeline[1]).toBe(100)
    expect(timeline[2]).toBe(200)
    expect(timeline[3]).toBe(500)
    expect(timeline[4]).toBe(600)
  })

  it('recovers exactly after a verse missing from ASR — the regression case for permanent drift', () => {
    const asrText = 'abcd'
    const breakpoints = uniformBreakpoints(asrText, 100)
    const timeline = buildApiCharTimeline(asrText, breakpoints, 'abXYZcd')

    // "ab" is an exact anchor; "cd" recovers to its exact anchor too — the missing "XYZ"
    // verse in between does NOT shift "cd"'s timing the way a single global proportional
    // scale would (that's the whole bug this replaces: one skipped section permanently
    // desyncing everything after it).
    expect(timeline[2]).toBe(200)
    expect(timeline[6]).toBe(300)
    expect(timeline[7]).toBe(400)

    // The interpolated positions inside the gap are monotonically increasing, not clamped
    // to a single edge value.
    expect(timeline[3]!).toBeGreaterThan(200)
    expect(timeline[4]!).toBeGreaterThan(timeline[3]!)
    expect(timeline[5]!).toBeGreaterThan(timeline[4]!)
    expect(timeline[5]!).toBeLessThan(300)
  })
})
