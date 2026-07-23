import { defineStore } from 'pinia'
import { estimateWordTimings } from '~/composables/useWordPlaybackTiming'
import type { Song, LyricLine, ScriptMode, WordBreakdown, PhraseGroup } from '~/types/song'

export const useSongStore = defineStore('song', {
  state: () => ({
    song: null as Song | null,
    currentTime: 0,
    isPlaying: false,
    showExplanations: true,
    scriptMode: 'original' as ScriptMode,
    showTranslation: true,
    darkMode: false,
    editMode: false,
    keyboardShortcutsEnabled: true,
    wordHighlightEnabled: true,
    selectedLineId: null as number | null,
    selectedWordPath: null as number[] | null,
  }),

  getters: {
    /**
     * Index of the "active" lyric line — the last one whose start has been reached, sticky
     * until the next line's start (not strict containment in its own [start, end)). This
     * avoids flicking off to "no active line" during instrumental gaps or when a line's own
     * end_time_ms is a touch early relative to when its last word actually finishes playing.
     */
    currentLineIndex(state): number {
      if (!state.song) return -1
      const lines = state.song.lyrics.lines
      let index = -1
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (!line || state.currentTime < line.start_time_ms) break
        index = i
      }
      return index
    },
    currentLine(): LyricLine | null {
      const idx = this.currentLineIndex
      return (idx >= 0 && this.song ? this.song.lyrics.lines[idx] : null) ?? null
    },
    currentSelectedLine(state): LyricLine | null {
      return state.song?.lyrics.lines.find((l) => l.id === state.selectedLineId) ?? null
    },

    /** The word at `selectedWordPath` within the currently selected line, if any. */
    selectedWord(state): WordBreakdown | null {
      if (!state.selectedWordPath) return null
      return getWordAtPath(this.currentSelectedLine?.breakdown ?? [], state.selectedWordPath)
    },

    /**
     * Index into currentLine.breakdown of the word currently "being sung" — the last
     * top-level word whose (real-or-estimated) start has been reached. -1 means none yet
     * (e.g. an instrumental lead-in within the line's own time window).
     */
    currentWordIndex(state): number {
      const line = this.currentLine
      if (!line || line.breakdown.length === 0) return -1

      const timings = estimateWordTimings(line)
      let index = -1
      for (let i = 0; i < timings.length; i++) {
        const timing = timings[i]
        if (!timing || state.currentTime < timing.start_time_ms) break
        index = i
      }
      return index
    },
  },

  actions: {
    setSong(song: Song | null) {
      this.song = song
      this.currentTime = 0
    },

    /** Fixture loader for QA/smoke-testing against a static JSON file (public/mock-data) */
    async loadSongFixture(path: string) {
      try {
        const response = await fetch(path)
        this.setSong(await response.json())
      } catch (error) {
        console.error('Failed to load song fixture:', error)
      }
    },

    toggleExplanations() {
      this.showExplanations = !this.showExplanations
    },

    toggleDarkMode() {
      this.darkMode = !this.darkMode
    },

    toggleTranslation() {
      this.showTranslation = !this.showTranslation
    },

    toggleKeyboardShortcuts() {
      this.keyboardShortcutsEnabled = !this.keyboardShortcutsEnabled
    },

    toggleWordHighlight() {
      this.wordHighlightEnabled = !this.wordHighlightEnabled
    },

    /** Walks `path` into a line's breakdown tree; path[0] indexes breakdown, path[1] indexes sub_words, etc. */
    updateWordAtPath(lineId: number, path: number[], updates: Partial<WordBreakdown>) {
      if (!this.song) return
      const line = this.song.lyrics.lines.find((l) => l.id === lineId)
      if (!line) return

      const [rootIndex, ...restPath] = path
      if (rootIndex === undefined) return
      const rootWord = line.breakdown[rootIndex]
      if (!rootWord) return

      const updatedRoot = updateWordAtSubPath(rootWord, restPath, updates)
      line.breakdown = line.breakdown.map((w, idx) => (idx === rootIndex ? updatedRoot : w))
    },

    updateWord(lineId: number, wordIndex: number, updates: Partial<WordBreakdown>) {
      this.updateWordAtPath(lineId, [wordIndex], updates)
    },

    /** Generalizes deleteWord: top-level deletes keep the "can't delete last word" guard; nested deletes splice the parent's sub_words. */
    deleteWordAtPath(lineId: number, path: number[]) {
      if (!this.song) return
      const line = this.song.lyrics.lines.find((l) => l.id === lineId)
      if (!line) return

      if (path.length === 1) {
        if (line.breakdown.length <= 1) {
          console.warn('Cannot delete the last word in a line')
          return
        }
        const deleteIndex = path[0]
        if (deleteIndex === undefined) return
        const deletedWord = line.breakdown[deleteIndex]
        line.breakdown = line.breakdown
          .filter((_, idx) => idx !== deleteIndex)
          // Positional correlation with the original ASR interpolation is void after a
          // top-level delete — clear real timing so playback falls back to the estimator.
          .map((word, idx) => ({ ...word, position: idx, start_time_ms: undefined, end_time_ms: undefined }))

        // A group needs 2+ members to mean anything — dissolve it if the delete orphaned it.
        if (deletedWord?.group_id) {
          const remainingMembers = line.breakdown.filter((w) => w.group_id === deletedWord.group_id)
          if (remainingMembers.length < 2) this.ungroupWords(lineId, deletedWord.group_id)
        }
        return
      }

      const [rootIndex, ...restPath] = path
      if (rootIndex === undefined) return
      const rootWord = line.breakdown[rootIndex]
      if (!rootWord) return

      const updatedRoot = deleteWordAtSubPath(rootWord, restPath)
      line.breakdown = line.breakdown.map((w, idx) => (idx === rootIndex ? updatedRoot : w))
    },

    deleteWord(lineId: number, wordIndex: number) {
      this.deleteWordAtPath(lineId, [wordIndex])
    },

    /** Appends an empty sub_word under the word at parentPath, marking it compound if it wasn't already. */
    addSubWord(lineId: number, parentPath: number[]) {
      if (!this.song) return
      const line = this.song.lyrics.lines.find((l) => l.id === lineId)
      if (!line) return

      const [rootIndex, ...restPath] = parentPath
      if (rootIndex === undefined) return
      const rootWord = line.breakdown[rootIndex]
      if (!rootWord) return

      const updatedRoot = addSubWordAtSubPath(rootWord, restPath)
      line.breakdown = line.breakdown.map((w, idx) => (idx === rootIndex ? updatedRoot : w))
    },

    /** Flips is_compound on the word at path, initializing sub_words: [] when turning it on. */
    toggleCompound(lineId: number, path: number[]) {
      if (!this.song) return
      const line = this.song.lyrics.lines.find((l) => l.id === lineId)
      if (!line) return

      const [rootIndex, ...restPath] = path
      if (rootIndex === undefined) return
      const rootWord = line.breakdown[rootIndex]
      if (!rootWord) return

      const updatedRoot = toggleCompoundAtSubPath(rootWord, restPath)
      line.breakdown = line.breakdown.map((w, idx) => (idx === rootIndex ? updatedRoot : w))
    },

    /**
     * Groups 2+ top-level breakdown entries into one phrase unit (e.g. a phrasal-verb-like
     * unit spanning several words). Only ever targets top-level indices — never a nested
     * sub_words path — keeping this axis separate from intra-word compound decomposition.
     */
    groupWords(lineId: number, wordIndices: number[], group: { meaning: string; translation?: string }) {
      if (!this.song) return
      if (wordIndices.length < 2) {
        console.warn('groupWords requires at least 2 word indices')
        return
      }

      const line = this.song.lyrics.lines.find((l) => l.id === lineId)
      if (!line) return

      const alreadyGrouped = wordIndices.some((idx) => line.breakdown[idx]?.group_id)
      if (alreadyGrouped) {
        console.warn('One or more selected words are already grouped — ungroup first')
        return
      }

      const id = crypto.randomUUID()
      const newGroup: PhraseGroup = { id, meaning: group.meaning, translation: group.translation }
      line.phrase_groups = [...(line.phrase_groups ?? []), newGroup]
      line.breakdown = line.breakdown.map((w, idx) => (wordIndices.includes(idx) ? { ...w, group_id: id } : w))
    },

    ungroupWords(lineId: number, groupId: string) {
      if (!this.song) return
      const line = this.song.lyrics.lines.find((l) => l.id === lineId)
      if (!line) return

      line.breakdown = line.breakdown.map((w) => (w.group_id === groupId ? { ...w, group_id: undefined } : w))
      line.phrase_groups = (line.phrase_groups ?? []).filter((g) => g.id !== groupId)
    },

    updatePhraseGroup(lineId: number, groupId: string, updates: Partial<Pick<PhraseGroup, 'meaning' | 'translation'>>) {
      if (!this.song) return
      const line = this.song.lyrics.lines.find((l) => l.id === lineId)
      if (!line) return

      line.phrase_groups = (line.phrase_groups ?? []).map((g) => (g.id === groupId ? { ...g, ...updates } : g))
    },

    reorderWords(lineId: number, oldIndex: number, newIndex: number) {
      if (!this.song) return
      const line = this.song.lyrics.lines.find((l) => l.id === lineId)
      if (!line) return

      const newBreakdown = [...line.breakdown]
      const [movedWord] = newBreakdown.splice(oldIndex, 1)
      if (!movedWord) return
      newBreakdown.splice(newIndex, 0, movedWord)
      newBreakdown.forEach((word, idx) => {
        word.position = idx
        // Order changed for every word, not just the moved one — real timing was
        // correlated to the old order, so it's all void now; fall back to the estimator.
        word.start_time_ms = undefined
        word.end_time_ms = undefined
      })
      line.breakdown = newBreakdown
    },

    addWordToLine(lineId: number) {
      if (!this.song) return
      const line = this.song.lyrics.lines.find((l) => l.id === lineId)
      if (!line) return

      const newWord: WordBreakdown = {
        text: '',
        script_type: 'hiragana',
        reading: '',
        transliteration: '',
        meanings: [],
        position: line.breakdown.length,
        is_compound: false,
        sub_words: undefined,
      }
      line.breakdown = [...line.breakdown, newWord]
    },

    /**
     * Sets timing on exactly this line — no redistribution to other lines. If every word in
     * the line currently has real per-word timing, that timing is rescaled proportionally to
     * the new [start, end) window (preserving each word's relative position/duration) —
     * otherwise the words already fall back to the estimator, which reflows from the line's
     * current bounds on its own, no rescaling needed.
     */
    setLineTiming(lineId: number, updates: { start_time_ms?: number; end_time_ms?: number }) {
      if (!this.song) return
      const lines = this.song.lyrics.lines
      const line = lines.find((l) => l.id === lineId)
      if (!line) return

      const maxMs = this.song.metadata.duration_ms
      const nextStart = updates.start_time_ms ?? line.start_time_ms
      const nextEnd = updates.end_time_ms ?? line.end_time_ms

      const oldStart = line.start_time_ms
      const oldEnd = line.end_time_ms
      const oldDuration = oldEnd - oldStart

      // Rounded here (the single mutation point) so callers computing from pixel ratios
      // (e.g. LineTimeline's drag math) can never persist fractional ms — the backend
      // requires integer milliseconds.
      line.start_time_ms = Math.round(Math.min(Math.max(0, nextStart), maxMs))
      line.end_time_ms = Math.round(Math.min(Math.max(line.start_time_ms, nextEnd), maxMs))

      const allReal = line.breakdown.every((w) => w.start_time_ms !== undefined && w.end_time_ms !== undefined)
      if (allReal && oldDuration > 0) {
        const scale = (line.end_time_ms - line.start_time_ms) / oldDuration
        line.breakdown = line.breakdown.map((w) => ({
          ...w,
          start_time_ms: Math.round(line.start_time_ms + (w.start_time_ms! - oldStart) * scale),
          end_time_ms: Math.round(line.start_time_ms + (w.end_time_ms! - oldStart) * scale),
        }))
      }

      lines.sort((a, b) => a.start_time_ms - b.start_time_ms)
    },

    selectLine(lineId: number) {
      this.selectedLineId = lineId
      // Switching lines invalidates whatever word was drilled into on the previous one.
      this.selectedWordPath = null
    },

    clearSelection() {
      this.selectedLineId = null
      this.selectedWordPath = null
    },

    /** Drills into the kanji-candidate sub-view for the word at `path` in the selected line. */
    selectWord(path: number[]) {
      this.selectedWordPath = path
    },

    clearWordSelection() {
      this.selectedWordPath = null
    },
  },

  persist: {
    pick: ['darkMode', 'keyboardShortcutsEnabled', 'wordHighlightEnabled'],
  },
})

/** Walks a full path (root breakdown index first, then sub_words indices) down to one word. */
function getWordAtPath(breakdown: WordBreakdown[], path: number[]): WordBreakdown | null {
  const [index, ...rest] = path
  if (index === undefined) return null
  const word = breakdown[index]
  if (!word) return null
  return rest.length === 0 ? word : getWordAtPath(word.sub_words ?? [], rest)
}

// --- Recursive helpers for the sub_words tree ---
// `path` here is always relative to `word.sub_words` (the root breakdown index is peeled off by the caller above).

function updateWordAtSubPath(word: WordBreakdown, path: number[], updates: Partial<WordBreakdown>): WordBreakdown {
  if (path.length === 0) {
    return {
      ...word,
      ...updates,
      meanings: updates.meanings
        ? Array.isArray(updates.meanings)
          ? updates.meanings
          : [updates.meanings].flat()
        : word.meanings,
      // Editing the text changes its character span, voiding the char-offset correlation
      // real timing was interpolated against — fall back to the estimator for this word.
      ...(updates.text !== undefined ? { start_time_ms: undefined, end_time_ms: undefined } : {}),
    }
  }

  const subWords = word.sub_words ?? []
  const [index, ...rest] = path
  if (index === undefined) return word
  const target = subWords[index]
  if (!target) return word

  const updatedTarget = updateWordAtSubPath(target, rest, updates)
  return { ...word, sub_words: subWords.map((sw, idx) => (idx === index ? updatedTarget : sw)) }
}

function deleteWordAtSubPath(word: WordBreakdown, path: number[]): WordBreakdown {
  const subWords = word.sub_words ?? []
  const [index, ...rest] = path
  if (index === undefined) return word

  if (rest.length === 0) {
    const nextSubWords = subWords.filter((_, idx) => idx !== index).map((sw, idx) => ({ ...sw, position: idx }))
    return { ...word, sub_words: nextSubWords }
  }

  const target = subWords[index]
  if (!target) return word

  const updatedTarget = deleteWordAtSubPath(target, rest)
  return { ...word, sub_words: subWords.map((sw, idx) => (idx === index ? updatedTarget : sw)) }
}

function addSubWordAtSubPath(word: WordBreakdown, path: number[]): WordBreakdown {
  if (path.length === 0) {
    const subWords = word.sub_words ?? []
    const newSubWord: WordBreakdown = {
      text: '',
      script_type: word.script_type,
      reading: '',
      transliteration: '',
      meanings: [],
      position: subWords.length,
      is_compound: false,
      sub_words: undefined,
    }
    return { ...word, is_compound: true, sub_words: [...subWords, newSubWord] }
  }

  const subWords = word.sub_words ?? []
  const [index, ...rest] = path
  if (index === undefined) return word
  const target = subWords[index]
  if (!target) return word

  const updatedTarget = addSubWordAtSubPath(target, rest)
  return { ...word, sub_words: subWords.map((sw, idx) => (idx === index ? updatedTarget : sw)) }
}

function toggleCompoundAtSubPath(word: WordBreakdown, path: number[]): WordBreakdown {
  if (path.length === 0) {
    const turningOn = !word.is_compound
    return { ...word, is_compound: turningOn, sub_words: turningOn ? (word.sub_words ?? []) : word.sub_words }
  }

  const subWords = word.sub_words ?? []
  const [index, ...rest] = path
  if (index === undefined) return word
  const target = subWords[index]
  if (!target) return word

  const updatedTarget = toggleCompoundAtSubPath(target, rest)
  return { ...word, sub_words: subWords.map((sw, idx) => (idx === index ? updatedTarget : sw)) }
}
