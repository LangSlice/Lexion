export interface SongMetadata {
  id: string
  title: string
  title_romaji: string
  title_translation: string
  artist: string
  album: string
  duration_ms: number
  language: string // Origin language (user's learning target)
  lyrics_language: string // Actual format: 'japanese' | 'romaji' | 'mixed' | 'unknown'
  lyrics_source: string // Source: 'musixmatch' | 'asr' | 'manual' | 'none'
  lyrics_confidence: number // 0.0-1.0 confidence in format detection
  tags: string[]
  difficulty: string
  release_year: number
}

/**
 * Pointer to the user's own media — never the bytes themselves, long-term.
 * Kept structurally separate from SongMetadata/Lyrics (derived knowledge) so
 * a Course can be exported/shared without ever bundling copyrighted media.
 */
export interface MediaReference {
  kind: 'youtube' | 'spotify' | 'upload'
  youtube_id?: string
  spotify_id?: string
  content_hash?: string
}

/** One ranked JMdict kanji spelling for a kana word's reading (see WordBreakdown.kanji_candidates). */
export interface KanjiCandidate {
  text: string
  meanings: string[]
}

export interface WordBreakdown {
  text: string
  script_type: 'kanji' | 'hiragana' | 'katakana' | 'english'
  reading?: string
  transliteration: string
  meanings: string[]
  context?: string
  position: number
  is_compound?: boolean
  sub_words?: WordBreakdown[]
  /**
   * Manually-curated phrase grouping (e.g. a phrasal-verb-like unit spanning several
   * sibling words). Only ever set on top-level breakdown entries, never inside sub_words —
   * that axis is intra-word script decomposition, a separate concern from this one.
   */
  group_id?: string
  /**
   * Ranked kanji spellings for this word's reading (JMdict-based, backend-generated).
   * Only ever populated when the word originated as kana and JMdict had at least one
   * kanji spelling for its reading — conjugated surface forms will usually be absent
   * (see backend/app/word_analysis/dictionary.py). `text` above already reflects the
   * top-ranked candidate by default; `reading` is the kana fallback ("None" option).
   */
  kanji_candidates?: KanjiCandidate[]
  /**
   * Real, ASR-derived per-word timing (hybrid strategy only for now, attached client-side
   * after /analyze — the backend never sets these). Absent means the caller must fall back
   * to a proportional estimate — see useWordPlaybackTiming, which decides real-vs-estimated
   * per line (never mixes the two within one line).
   */
  start_time_ms?: number
  end_time_ms?: number
}

/** A manually-curated semantic unit spanning 2+ sibling WordBreakdown entries in a line. */
export interface PhraseGroup {
  id: string
  meaning: string
  translation?: string
}

export interface LyricLine {
  id: number
  start_time_ms: number
  end_time_ms: number
  text: {
    original: string
    reading: string
    transliteration: string
    translation: string
    explanation?: string
  }
  breakdown: WordBreakdown[]
  phrase_groups?: PhraseGroup[]
}

export interface Lyrics {
  lines: LyricLine[]
}

export interface Song {
  metadata: SongMetadata
  media: MediaReference
  lyrics: Lyrics
}

export type ScriptMode = 'original' | 'furigana' | 'romaji'
