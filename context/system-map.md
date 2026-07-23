# System map

Quick orientation. For exact file paths, function names, and request/response shapes, see
[../docs/product-architecture.md](../docs/product-architecture.md) — this file is the
one-paragraph-per-thing summary that tells you *where* to look.

## Backend (`backend/app/`, FastAPI)

- **`song_processing/`** — the pipeline orchestrator.
  - `youtube.py` — YouTube **metadata only** (no download, see legal-constraints.md).
  - `lyrics.py` — Musixmatch fetch, gated behind `ENABLE_LICENSED_LYRICS_PROVIDERS`.
  - `service.py` — `SongProcessingService`, the orchestrator: process/analyze/store/export/
    import, plus the word-analysis cache (keyed by text hash).
  - `repository.py` — persistence: `CourseRepository` (Supabase-backed, in-memory fallback),
    `ProcessingCacheRepository` (same pattern).
  - `router.py` — the HTTP layer, all `/api/songs/*` endpoints.
  - `models.py` — every Pydantic request/response/domain model.
- **`word_analysis/`** — the actual NLP: fugashi/MeCab tokenization, JMDict dictionary
  lookups, pykakasi romaji, kanji-compound splitting. No third-party service involved, no
  legal constraints beyond "this is a static, freely-licensed dictionary dataset."
- **`shared/`** — `config.py` (env-var settings, feature flags), `db.py` (Supabase client).

## Frontend (`frontend/app/`, Nuxt/Vue)

- **`types/`** — the shared contracts: `song.ts` (`Song`/`MediaReference`/`Lyrics`),
  `library.ts` (`SongReference`/`Collection`/`Album`), `lyricsStrategy.ts` (what a strategy
  needs as input/produces as output).
- **`stores/`** (Pinia) — `song.ts` (the currently-loaded course + editor state),
  `library.ts` (Collections/Albums/SongReferences, localStorage-persisted), `processing.ts`
  (progress state machine for a running strategy), `features.ts` (backend flag state),
  `playerControls.ts` (the one place `SongPlayer.vue` and keyboard shortcuts both talk to).
- **`lyrics-strategies/`** — `asrStrategy.ts`, `hybridStrategy.ts`, `legacyStrategy.ts`, each
  implementing the same `LyricsStrategy` interface. `useLyricsPipeline.ts` orchestrates
  whichever one is picked, then handles the shared post-processing (word-analysis, storage).
- **`services/`** — `songApi.ts`/`courseApi.ts` (backend REST client), `apiClient.ts` (owner-
  token header injection), `uploadedAudioStore.ts` (IndexedDB-persisted uploaded files),
  `youtubeSearch.ts` (YouTube search via the Nuxt server route, never direct from browser).
- **`components/`** — `library/SearchModal.vue` (search + upload UI), `player/SongPlayer.vue`
  (forks on `media.kind`), `processing/LyricsStrategyPicker.vue` (strategy selection + the
  no-strategy-available fallback), `editor/` (word/line editing UI), `lyrics/` (the
  read/playback display).
- **`pages/`** — `library/[collectionId]/song/[songId].vue` is the main "do work" page:
  loads or triggers processing of a song, hosts the player + editor.

## Data model

```
Collection (language-scoped, e.g. "Japanese Songs")
  └─ Album (a playlist)
       └─ SongReference (localStorage: title/artist/thumbnail, youtubeId?, contentHash?, isProcessed)
            └─ Song (backend-stored, once processed)
                 ├─ metadata: SongMetadata (title, artist, language, lyrics_source, ...)
                 ├─ media: MediaReference (kind: youtube|spotify|upload, youtube_id?, content_hash?)
                 └─ lyrics: Lyrics
                      └─ LyricLine[] (start_time_ms, end_time_ms, text, breakdown: WordBreakdown[])
```

`media` and `lyrics` are deliberately separate fields on `Song` — content vs. knowledge, see
legal-constraints.md.

## Endpoints (`/api/songs/*`)

See the table in `docs/product-architecture.md` §5 — kept there, not duplicated here, since
it changes more often than this map does.
