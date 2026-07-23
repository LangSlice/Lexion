/**
 * Real word/char-level alignment between the ASR (Whisper) transcript and the
 * known-good (Musixmatch) lyric text, replacing the old single-scalar
 * proportional char-ratio stretch. Runs a Needleman-Wunsch global alignment
 * at the character level once per song, then only trusts pure-match runs as
 * timing anchors — substituted/deleted spans (where ASR and API text disagree)
 * get their timestamps interpolated between the nearest surrounding anchors
 * instead of inheriting a globally-averaged rate. This is what stops one
 * mis-heard or missed section from permanently desyncing everything after it.
 */
import type { CharBreakpoint } from '~/lyrics-strategies/charPositionAlignment'
import { timeAtCharPosition } from '~/lyrics-strategies/charPositionAlignment'

/** Punctuation/whitespace ignored for matching purposes only — original text is untouched. */
const ALIGNMENT_IGNORED_CHARS = /[\s,.!?、。！？「」『』・…～\-—'"()[\]{}:;]/

export interface NormalizedText {
  normalized: string
  /** For each char kept in `normalized`, its index in the original input string. */
  originalIndex: number[]
}

/**
 * Strips punctuation (matching-only) and folds full-width/half-width variants via
 * per-character NFKC, keeping a 1:1 index back to the original string. NFKC is applied
 * per-character (not to the whole string) so a rare length-changing normalization
 * (e.g. a ligature) can't desync the original-index mapping.
 */
export function normalizeForAlignment(text: string): NormalizedText {
  let normalized = ''
  const originalIndex: number[] = []

  for (let i = 0; i < text.length; i++) {
    const raw = text[i]!
    if (ALIGNMENT_IGNORED_CHARS.test(raw)) continue

    const folded = raw.normalize('NFKC')
    const ch = (folded.length === 1 ? folded : raw).toLowerCase()

    normalized += ch
    originalIndex.push(i)
  }

  return { normalized, originalIndex }
}

export type AlignOpType = 'match' | 'sub' | 'insert' | 'delete'

export interface AlignOp {
  type: AlignOpType
  /** Index into sequence `a`, when this op consumes a char from it (match/sub/insert). */
  aIndex?: number
  /** Index into sequence `b`, when this op consumes a char from it (match/sub/delete). */
  bIndex?: number
}

export interface SequenceAlignmentOptions {
  matchScore?: number
  mismatchPenalty?: number
  gapPenalty?: number
}

const DEFAULT_MATCH_SCORE = 2
const DEFAULT_MISMATCH_PENALTY = 1
const DEFAULT_GAP_PENALTY = 1

/**
 * Needleman-Wunsch global alignment between two already-normalized strings.
 * `a` is treated as the ASR/reference side (an "insert" op = extra ASR char,
 * e.g. hallucinated filler); `b` is the API/target side (a "delete" op = API
 * char with no ASR counterpart, e.g. a verse ASR missed entirely).
 */
export function alignSequences(a: string, b: string, options: SequenceAlignmentOptions = {}): AlignOp[] {
  const matchScore = options.matchScore ?? DEFAULT_MATCH_SCORE
  const mismatchPenalty = options.mismatchPenalty ?? DEFAULT_MISMATCH_PENALTY
  const gapPenalty = options.gapPenalty ?? DEFAULT_GAP_PENALTY

  const n = a.length
  const m = b.length
  const width = m + 1

  const score = new Float32Array((n + 1) * width)
  // direction: 0 = diagonal (match/sub), 1 = up (consume only a), 2 = left (consume only b)
  const dir = new Uint8Array((n + 1) * width)
  const at = (i: number, j: number) => i * width + j

  for (let i = 1; i <= n; i++) {
    score[at(i, 0)] = -i * gapPenalty
    dir[at(i, 0)] = 1
  }
  for (let j = 1; j <= m; j++) {
    score[at(0, j)] = -j * gapPenalty
    dir[at(0, j)] = 2
  }

  for (let i = 1; i <= n; i++) {
    const ai = a.charCodeAt(i - 1)
    for (let j = 1; j <= m; j++) {
      const bj = b.charCodeAt(j - 1)
      const diag = score[at(i - 1, j - 1)]! + (ai === bj ? matchScore : -mismatchPenalty)
      const up = score[at(i - 1, j)]! - gapPenalty
      const left = score[at(i, j - 1)]! - gapPenalty

      let best = diag
      let bestDir = 0
      if (up > best) {
        best = up
        bestDir = 1
      }
      if (left > best) {
        best = left
        bestDir = 2
      }

      score[at(i, j)] = best
      dir[at(i, j)] = bestDir
    }
  }

  const ops: AlignOp[] = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    const d = i > 0 && j > 0 ? dir[at(i, j)]! : i > 0 ? 1 : 2
    if (d === 0) {
      const isMatch = a.charCodeAt(i - 1) === b.charCodeAt(j - 1)
      ops.push({ type: isMatch ? 'match' : 'sub', aIndex: i - 1, bIndex: j - 1 })
      i--
      j--
    } else if (d === 1) {
      ops.push({ type: 'insert', aIndex: i - 1 })
      i--
    } else {
      ops.push({ type: 'delete', bIndex: j - 1 })
      j--
    }
  }
  ops.reverse()
  return ops
}

interface Anchor {
  apiOrigIdx: number
  asrOrigIdx: number
}

/**
 * Builds anchors from pure-match ops only — substitutions are text disagreements, so even
 * though the DP aligned them, their ASR timestamp isn't trusted for that position (per design:
 * API text is ground truth for correctness, ASR timing is only trusted where both agree).
 *
 * Each anchor records the *end* boundary of a matched character (originalIndex + 1) rather
 * than its start: a match consumes exactly one char from each side, so its end boundary is
 * the one point we can state as fact regardless of what's on either side (an adjacent
 * mismatch/insert/delete doesn't share that boundary, so it can't be inferred from neighbors
 * the way a mid-run boundary can). Anchors come out strictly increasing in both coordinates
 * because op indices only ever advance.
 */
function buildAnchors(ops: AlignOp[], asrNorm: NormalizedText, apiNorm: NormalizedText): Anchor[] {
  const anchors: Anchor[] = []
  for (const op of ops) {
    if (op.type !== 'match' || op.aIndex === undefined || op.bIndex === undefined) continue
    anchors.push({
      apiOrigIdx: apiNorm.originalIndex[op.bIndex]! + 1,
      asrOrigIdx: asrNorm.originalIndex[op.aIndex]! + 1,
    })
  }
  return anchors
}

/**
 * Builds a dense lookup table, one resolved ASR-transcript timestamp per character-boundary
 * position (0..knownLyricsText.length inclusive) in the known-lyrics char-space. Positions
 * inside a trusted match run resolve exactly; positions inside a substituted/deleted run are
 * linearly interpolated between the nearest surrounding anchors; positions before the first or
 * after the last anchor clamp to the ASR transcript's start/end.
 */
export function buildApiCharTimeline(asrText: string, breakpoints: CharBreakpoint[], knownLyricsText: string): number[] {
  const asrNorm = normalizeForAlignment(asrText)
  const apiNorm = normalizeForAlignment(knownLyricsText)
  const ops = alignSequences(asrNorm.normalized, apiNorm.normalized)
  const anchors = buildAnchors(ops, asrNorm, apiNorm)

  const totalLength = knownLyricsText.length
  const asrTextLength = asrText.length
  const apiCharToTimeMs: number[] = new Array(totalLength + 1)

  let anchorIdx = 0
  for (let pos = 0; pos <= totalLength; pos++) {
    while (anchorIdx < anchors.length && anchors[anchorIdx]!.apiOrigIdx < pos) anchorIdx++

    const hi = anchors[anchorIdx]
    const lo = anchorIdx > 0 ? anchors[anchorIdx - 1] : undefined

    let asrIdx: number
    if (hi && hi.apiOrigIdx === pos) {
      asrIdx = hi.asrOrigIdx
    } else if (lo && hi) {
      const ratio = (pos - lo.apiOrigIdx) / (hi.apiOrigIdx - lo.apiOrigIdx)
      asrIdx = lo.asrOrigIdx + ratio * (hi.asrOrigIdx - lo.asrOrigIdx)
    } else if (lo && !hi) {
      asrIdx = asrTextLength // trailing run past the last anchor: clamp to ASR end
    } else {
      asrIdx = 0 // leading run before the first anchor (or no anchors at all): clamp to ASR start
    }

    apiCharToTimeMs[pos] = Math.round(timeAtCharPosition(breakpoints, asrIdx))
  }

  return apiCharToTimeMs
}
