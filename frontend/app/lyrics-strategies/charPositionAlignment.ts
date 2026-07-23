/**
 * ASR word-breakpoint construction and char-position-to-time resolution — the low-level
 * primitives that `sequenceAlignment.ts` builds a real forced-alignment timeline on top of.
 */
import type { TranscriptionChunk } from '~/workers/whisperTranscriber.worker'

export interface CharBreakpoint {
  charStart: number
  charEnd: number
  timeStartMs: number
  timeEndMs: number
}

/** Strips whitespace so character-position ratios aren't skewed by formatting differences */
export function stripWhitespace(text: string): string {
  return text.replace(/\s+/g, '')
}

export function buildAsrBreakpoints(chunks: TranscriptionChunk[]): { text: string; breakpoints: CharBreakpoint[] } {
  let cursor = 0
  const breakpoints: CharBreakpoint[] = []
  let text = ''

  for (const chunk of chunks) {
    const clean = stripWhitespace(chunk.text)
    if (!clean) continue

    const startMs = chunk.timestamp[0] * 1000
    const endMs = (chunk.timestamp[1] ?? chunk.timestamp[0] + 0.3) * 1000

    breakpoints.push({ charStart: cursor, charEnd: cursor + clean.length, timeStartMs: startMs, timeEndMs: endMs })
    text += clean
    cursor += clean.length
  }

  return { text, breakpoints }
}

export function timeAtCharPosition(breakpoints: CharBreakpoint[], charPos: number): number {
  if (breakpoints.length === 0) return 0

  for (const bp of breakpoints) {
    if (charPos >= bp.charStart && charPos <= bp.charEnd) {
      const span = bp.charEnd - bp.charStart
      const ratio = span > 0 ? (charPos - bp.charStart) / span : 0
      return bp.timeStartMs + ratio * (bp.timeEndMs - bp.timeStartMs)
    }
  }

  // Outside the transcribed range: clamp to nearest edge (length already checked above)
  const first = breakpoints[0]!
  return charPos < first.charStart ? first.timeStartMs : breakpoints.at(-1)!.timeEndMs
}

/**
 * Resolves a time for every word boundary in `words`, given their concatenation starts at
 * `containerCharOffset` within the known-lyrics char-space `apiCharToTimeMs` was built
 * against (see `sequenceAlignment.ts#buildApiCharTimeline`). Plain array lookups — all the
 * alignment work already happened when the timeline was built.
 */
export function timeForWordBoundaries(
  apiCharToTimeMs: number[],
  containerCharOffset: number,
  words: string[]
): { start_time_ms: number; end_time_ms: number }[] {
  const lastTimeMs = apiCharToTimeMs.at(-1) ?? 0
  let cursor = containerCharOffset

  return words.map((word) => {
    const start_time_ms = apiCharToTimeMs[cursor] ?? lastTimeMs
    cursor += stripWhitespace(word).length
    const end_time_ms = apiCharToTimeMs[cursor] ?? lastTimeMs
    return { start_time_ms, end_time_ms }
  })
}
