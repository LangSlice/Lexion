import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSongStore } from '~/stores/song'
import type { Song, WordBreakdown } from '~/types/song'

function word(overrides: Partial<WordBreakdown> = {}): WordBreakdown {
  return {
    text: 'はし',
    script_type: 'hiragana',
    transliteration: 'hashi',
    meanings: [],
    position: 0,
    ...overrides,
  }
}

function songWithOneLine(breakdown: WordBreakdown[]): Song {
  return {
    metadata: {
      id: 's1',
      title: '',
      title_romaji: '',
      title_translation: '',
      artist: '',
      album: '',
      duration_ms: 1000,
      language: 'ja',
      lyrics_language: 'japanese',
      lyrics_source: 'musixmatch',
      lyrics_confidence: 1,
      tags: [],
      difficulty: 'beginner',
      release_year: 2024,
    },
    media: { kind: 'youtube', youtube_id: '', spotify_id: '' },
    lyrics: {
      lines: [
        {
          id: 1,
          start_time_ms: 0,
          end_time_ms: 1000,
          text: { original: 'はし', reading: 'はし', transliteration: 'hashi', translation: '' },
          breakdown,
        },
      ],
    },
  }
}

describe('useSongStore word selection', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('selectWord sets selectedWordPath and selectedWord resolves the word at that path', () => {
    const store = useSongStore()
    store.setSong(songWithOneLine([word({ text: '橋', kanji_candidates: [{ text: '橋', meanings: ['bridge'] }] })]))
    store.selectLine(1)

    store.selectWord([0])

    expect(store.selectedWordPath).toEqual([0])
    expect(store.selectedWord?.text).toBe('橋')
  })

  it('selectWord resolves a nested sub_words path', () => {
    const store = useSongStore()
    const compound = word({
      text: '橋渡し',
      is_compound: true,
      sub_words: [word({ text: '橋' }), word({ text: '渡し' })],
    })
    store.setSong(songWithOneLine([compound]))
    store.selectLine(1)

    store.selectWord([0, 1])

    expect(store.selectedWord?.text).toBe('渡し')
  })

  it('clearWordSelection resets selectedWordPath without touching the line selection', () => {
    const store = useSongStore()
    store.setSong(songWithOneLine([word()]))
    store.selectLine(1)
    store.selectWord([0])

    store.clearWordSelection()

    expect(store.selectedWordPath).toBeNull()
    expect(store.selectedLineId).toBe(1)
  })

  it('selectLine resets any previous word selection', () => {
    const store = useSongStore()
    store.setSong(songWithOneLine([word()]))
    store.selectLine(1)
    store.selectWord([0])

    store.selectLine(1)

    expect(store.selectedWordPath).toBeNull()
  })

  it('clearSelection resets both line and word selection', () => {
    const store = useSongStore()
    store.setSong(songWithOneLine([word()]))
    store.selectLine(1)
    store.selectWord([0])

    store.clearSelection()

    expect(store.selectedLineId).toBeNull()
    expect(store.selectedWordPath).toBeNull()
  })

  it('selectedWord is null when no word path is set', () => {
    const store = useSongStore()
    store.setSong(songWithOneLine([word()]))
    store.selectLine(1)

    expect(store.selectedWord).toBeNull()
  })
})
