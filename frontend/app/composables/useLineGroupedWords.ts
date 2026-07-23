import type { LyricLine, PhraseGroup, WordBreakdown } from '~/types/song'

export interface GroupedWordRun {
  type: 'word'
  word: WordBreakdown
  index: number
  /** Set when this word carries a group_id whose run collapsed to length 1 (e.g. after a reorder split the group apart). */
  orphanedGroup?: PhraseGroup
}

export interface GroupedGroupRun {
  type: 'group'
  group: PhraseGroup
  words: { word: WordBreakdown; index: number }[]
}

export type GroupedRun = GroupedWordRun | GroupedGroupRun

/**
 * Walks a line's breakdown and collapses contiguous runs sharing a group_id into a single
 * "group" entry. Lines without phrase_groups produce only length-1 "word" runs, so the
 * render path is identical to a plain word-by-word walk — this is what keeps the feature
 * backward compatible with lines that never used it.
 */
export function useLineGroupedWords(line: LyricLine): GroupedRun[] {
  const groupsById = new Map((line.phrase_groups ?? []).map((g) => [g.id, g]))
  const runs: GroupedRun[] = []

  let i = 0
  while (i < line.breakdown.length) {
    const word = line.breakdown[i]
    if (!word) {
      i++
      continue
    }
    const group = word.group_id ? groupsById.get(word.group_id) : undefined

    if (!group) {
      runs.push({ type: 'word', word, index: i })
      i++
      continue
    }

    const members: { word: WordBreakdown; index: number }[] = []
    let j = i
    while (j < line.breakdown.length) {
      const candidate = line.breakdown[j]
      if (!candidate || candidate.group_id !== group.id) break
      members.push({ word: candidate, index: j })
      j++
    }

    if (members.length >= 2) {
      runs.push({ type: 'group', group, words: members })
    } else {
      runs.push({ type: 'word', word, index: i, orphanedGroup: group })
    }
    i = j
  }

  return runs
}
