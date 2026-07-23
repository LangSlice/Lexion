/**
 * Word-level refinement layered on top of sequenceAlignment.ts's char-level
 * forced alignment. The char-level pass only trusts pure-match *characters* as
 * timing anchors — it has no concept of "this run of chars is one ASR-heard
 * word" or "this line is a structural marker, not lyrics" and so can (a) let
 * a line boundary land mid-word relative to what Whisper actually heard, and
 * (b) smear a mis-heard word's timing across an interpolated run instead of
 * anchoring it to the one ASR word that actually produced it.
 *
 * CJK reference text has no whitespace word boundaries, so "word-level" here
 * means ASR-word-level: each Whisper chunk is the unit of trust, and every
 * reference character it best-matches gets that one chunk's time divided
 * across it proportionally — instead of a coarser multi-word interpolated run.
 * Section-marker lines ([Chorus], VERSE 2, ...) are excluded entirely so a
 * mis-heard word's timing can never leak into — or be redistributed from — a
 * structural tag that isn't really sung lyrics.
 */
import { alignSequences, normalizeForAlignment } from '~/lyrics-strategies/sequenceAlignment'
import { buildAsrBreakpoints, stripWhitespace } from '~/lyrics-strategies/charPositionAlignment'
import type { DraftLyricLine } from '~/types/lyricsStrategy'
import type { TranscriptionChunk } from '~/workers/whisperTranscriber.worker'

const SECTION_MARKER_BRACKETS = /^\[.*\]$/
const SECTION_MARKER_WORD = /^(chorus|verse|bridge|intro|outro|hook|pre-chorus|prechorus)(\s*[x×]?\s*\d+)?$/i

/** True for structural tags (`[Chorus]`, `Verse 2`, `Bridge x2`) — never real sung lyrics. */
export function isSectionMarker(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  return SECTION_MARKER_BRACKETS.test(trimmed) || SECTION_MARKER_WORD.test(trimmed)
}

interface AsrWordSpan {
  charStart: number
  charEnd: number
  startMs: number
  endMs: number
}

/** One entry per non-blank ASR chunk, in the same stripped char-space `buildAsrBreakpoints` produces. */
function buildAsrWordSpans(chunks: TranscriptionChunk[]): AsrWordSpan[] {
  let cursor = 0
  const spans: AsrWordSpan[] = []

  for (const chunk of chunks) {
    const clean = stripWhitespace(chunk.text)
    if (!clean) continue

    const startMs = chunk.timestamp[0] * 1000
    const endMs = (chunk.timestamp[1] ?? chunk.timestamp[0] + 0.3) * 1000
    spans.push({ charStart: cursor, charEnd: cursor + clean.length, startMs, endMs })
    cursor += clean.length
  }

  return spans
}

interface LineCharRange {
  start: number
  end: number
  isMarker: boolean
}

function buildLineCharRanges(lines: DraftLyricLine[], perLineCharOffset: number[]): LineCharRange[] {
  return lines.map((line, i) => {
    const start = perLineCharOffset[i]!
    const end = start + stripWhitespace(line.text).length
    return { start, end, isMarker: isSectionMarker(line.text) }
  })
}

function isMarkerCharPos(pos: number, ranges: LineCharRange[]): boolean {
  return ranges.some((r) => r.isMarker && pos >= r.start && pos < r.end)
}

export interface RefinedLineTimings {
  lines: DraftLyricLine[]
  apiCharToTimeMs: number[]
}

/**
 * Snaps line boundaries and substituted-span timestamps to ASR-word granularity.
 * Reuses the same char-level DP as sequenceAlignment.ts (no separate algorithm),
 * but groups its ops by which ASR *word* (Whisper chunk) each aligned char
 * belongs to, then treats each word's matched reference-char range as a single
 * unit: its ASR timing is divided proportionally across that whole range,
 * rather than the char-level pass's coarser anchor-to-anchor interpolation.
 * Marker lines are skipped entirely — their timing is left exactly as the
 * char-level pass produced it, and no ASR word's redistribution is ever
 * allowed to touch a marker line's char range.
 */
export function refineLineWordTimings(
  lines: DraftLyricLine[],
  perLineCharOffset: number[],
  asrChunks: TranscriptionChunk[],
  apiCharToTimeMs: number[]
): RefinedLineTimings {
  const nonBlankChunks = asrChunks.filter((c) => c.text.trim())
  if (nonBlankChunks.length === 0) return { lines, apiCharToTimeMs }

  const { text: asrText } = buildAsrBreakpoints(nonBlankChunks)
  const wordSpans = buildAsrWordSpans(nonBlankChunks)
  const lineRanges = buildLineCharRanges(lines, perLineCharOffset)

  const knownLyricsText = lines.map((line) => stripWhitespace(line.text)).join('')
  const asrNorm = normalizeForAlignment(asrText)
  const apiNorm = normalizeForAlignment(knownLyricsText)
  const ops = alignSequences(asrNorm.normalized, apiNorm.normalized)

  // Which ASR word (by index into wordSpans) each ASR *character* belongs to.
  const asrCharToWordIndex = new Int32Array(asrText.length).fill(-1)
  wordSpans.forEach((span, wordIdx) => {
    for (let c = span.charStart; c < span.charEnd; c++) asrCharToWordIndex[c] = wordIdx
  })

  // For each ASR word, the contiguous reference-char range (original indices) it best matches.
  const perWordRefRange = new Map<number, { minIdx: number; maxIdx: number }>()
  for (const op of ops) {
    if (op.aIndex === undefined || op.bIndex === undefined) continue // insert/delete: no both-sided range to attribute

    const asrOrigIdx = asrNorm.originalIndex[op.aIndex]!
    const wordIdx = asrCharToWordIndex[asrOrigIdx]
    if (wordIdx === undefined || wordIdx === -1) continue

    const apiOrigIdx = apiNorm.originalIndex[op.bIndex]!
    if (isMarkerCharPos(apiOrigIdx, lineRanges)) continue // never attribute a marker line's chars to a substitution

    const existing = perWordRefRange.get(wordIdx)
    if (!existing) perWordRefRange.set(wordIdx, { minIdx: apiOrigIdx, maxIdx: apiOrigIdx })
    else {
      existing.minIdx = Math.min(existing.minIdx, apiOrigIdx)
      existing.maxIdx = Math.max(existing.maxIdx, apiOrigIdx)
    }
  }

  const refinedTimeline = apiCharToTimeMs.slice()

  for (const [wordIdx, range] of perWordRefRange) {
    const span = wordSpans[wordIdx]
    if (!span) continue

    const refStart = range.minIdx
    const refEnd = range.maxIdx + 1
    const refLength = refEnd - refStart
    if (refLength <= 0) continue

    for (let pos = refStart; pos <= refEnd; pos++) {
      const ratio = (pos - refStart) / refLength
      refinedTimeline[pos] = Math.round(span.startMs + ratio * (span.endMs - span.startMs))
    }
  }

  const refinedLines = lines.map((line, i) => {
    const range = lineRanges[i]!
    if (range.isMarker) return line // leave marker lines exactly as the char-level pass set them

    return {
      ...line,
      start_time_ms: refinedTimeline[range.start] ?? line.start_time_ms,
      end_time_ms: refinedTimeline[range.end] ?? line.end_time_ms,
    }
  })

  return { lines: refinedLines, apiCharToTimeMs: refinedTimeline }
}
