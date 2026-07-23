import type { LyricLine } from '~/types/song'

export interface WordTiming {
  start_time_ms: number
  end_time_ms: number
}

/** Unicode-aware letter/digit length, mirroring subtitler's estimator weight function. */
function wordWeight(text: string): number {
  return Math.max(1, text.replace(/[^\p{L}\p{N}]/gu, '').length)
}

/**
 * Resolves per-word (top-level breakdown only, not sub_words) playback timing for a line:
 * real ASR-derived timestamps when EVERY word has them, otherwise a full-line proportional
 * estimate (character-weight distribution across the line's own [start, end) window) for
 * every word in that line — real and estimated are never mixed within one line, since a
 * partial-real line usually means a structural edit invalidated some but not all entries,
 * and mixing would produce inconsistent overlaps.
 */
export function estimateWordTimings(line: LyricLine): WordTiming[] {
  const words = line.breakdown

  const allReal = words.every((w) => w.start_time_ms !== undefined && w.end_time_ms !== undefined)
  if (allReal) {
    // Defensive clamp: real timing is normally kept in sync with the line's own bounds by
    // setLineTiming's rescale, but this guards against stale data (e.g. saved before that
    // fix existed) ever pinning a word's real timestamp outside the line's current window,
    // which would otherwise strand it — currentTime could never reach it again.
    let previousEnd = line.start_time_ms
    return words.map((w) => {
      const clampedStart = Math.min(Math.max(w.start_time_ms!, line.start_time_ms), line.end_time_ms)
      const clampedEnd = Math.min(Math.max(w.end_time_ms!, clampedStart), line.end_time_ms)
      const start = Math.max(clampedStart, previousEnd)
      const end = Math.max(clampedEnd, start)
      previousEnd = end
      return { start_time_ms: start, end_time_ms: end }
    })
  }

  const duration = line.end_time_ms - line.start_time_ms
  const weights = words.map((w) => wordWeight(w.text))
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1

  let cursor = line.start_time_ms
  return words.map((word, index) => {
    const isLast = index === words.length - 1
    const start = cursor
    const end = isLast ? line.end_time_ms : cursor + (duration * wordWeight(word.text)) / totalWeight
    cursor = end
    return { start_time_ms: start, end_time_ms: Math.max(start, end) }
  })
}
