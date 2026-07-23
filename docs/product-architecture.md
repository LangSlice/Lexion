# Lexion — Product & Architecture

## 1. Product model

Lexion is a Language learning app, not a lesson-tree app: users build **Collections**
(language-scoped, e.g. "Japanese Songs") of **Albums** (playlists) of **Songs**, and learn
by interacting directly with a song's lyrics — hovering/tapping words for meaning, expanding
kanji compounds into per-character breakdowns, karaoke-style sync during playback. No XP,
streaks, or generated exercises.

```
Collection (language: "ja")
  └─ Album ("Japanese Songs Playlist")
       └─ SongReference (youtubeId, isProcessed, processedSongId?)
            └─ Song (metadata + media: MediaReference + lyrics: Lyrics)
                 └─ LyricLine (start_time_ms, end_time_ms, text, breakdown: WordBreakdown[])
                      └─ WordBreakdown (reading, transliteration, meanings, sub_words? for kanji compounds)
```

## 2. Legal/IP architecture — Content vs. Knowledge

This project processes user-supplied media into derived language-learning knowledge. To
minimize copyright/IP risk, a few structural rules apply throughout:

- **`Song.media: MediaReference`** (`kind: 'youtube' | 'spotify' | 'upload'`, plus
  `youtube_id`/`spotify_id`/`content_hash`) is kept structurally separate from
  **`Song.lyrics: Lyrics`** (the derived knowledge — timestamps, word breakdowns,
  translations). The media reference is a pointer, never the audio/video bytes themselves,
  long-term.
- **Transcription requires the user's own uploaded file — there is no server-side YouTube
  audio download.** YouTube's Terms of Service explicitly prohibit third-party download
  tools, with no operator-approval path that could make one compliant (unlike Musixmatch,
  below) — so `backend/app/song_processing/youtube.py` only ever calls `yt-dlp` with
  `download=False` (public metadata, same as YouTube's own oEmbed/Data API would return).
  Actual audio bytes for transcription come exclusively from a file the user uploads
  themselves (`frontend/app/services/uploadedAudioStore.ts`, an IndexedDB-backed store keyed
  by `content_hash`) — read directly in the browser, never touching the backend. See §4.
- **No licensed lyrics database is the default source.** The primary pipeline is
  Media → in-browser Whisper transcription → server-side word analysis (ASR strategy).
  A Musixmatch integration exists (`backend/app/song_processing/lyrics.py`) but is gated
  behind `ENABLE_LICENSED_LYRICS_PROVIDERS` (off by default) — only enable it if you have
  your own Musixmatch developer approval for full-lyrics access. There is no Genius
  integration: Genius doesn't expose lyrics via a public API, and the scraping-based
  approach some libraries use to get around that violates Genius's terms of service
  regardless of who runs it or whether the code is open-source — so it isn't included here
  at all, rather than just feature-flagged off.
- **Ownership**: stored courses are scoped by an opaque per-client `owner_token`
  (`X-Owner-Token` header, generated client-side, see `frontend/app/utils/ownerToken.ts`) —
  not a login system, just enough to stop a stranger who obtains/guesses a song ID from
  reading or overwriting someone else's course. `GET`/`PUT /songs/{id}` return 404 (not 403)
  on a mismatched token, to avoid confirming a given ID exists to a non-owner.
- **Caching by content hash, not by song identity.** Word-analysis results are cached in
  `processing_cache` keyed by a hash of the exact submitted lyric text (not the source
  audio — ASR transcription of the same audio isn't guaranteed reproducible run-to-run, so
  an audio-hash key could serve breakdown/timestamps that don't match the caller's actual
  transcript). This is a computation-reuse optimization, not a public catalog: there is no
  endpoint that lists/searches previously-processed songs by artist or title.
- **Portable export/import.** `GET /songs/{id}/export` produces a `course.json` containing
  only derived knowledge, never media. If a course's `lyrics_source` is a licensed provider
  (Musixmatch), the verbatim text is redacted on export (`redacted_licensed_text: true`) —
  the recipient must re-fetch it themselves under their own credentials. ASR/manual
  transcriptions (the user's own annotation of their own linked content) are exported as-is.
  `POST /songs/import` re-stores an imported `course.json` under the importer's own
  `owner_token`.

## 3. Frontend — Nuxt 3/4

`frontend/`: Nuxt (SPA mode, `ssr: false`), Pinia (+ `pinia-plugin-persistedstate` for
localStorage-backed state), Tailwind, VueUse, `lucide-vue-next`.

- `app/types/` — `song.ts` (`Song`/`SongMetadata`/`MediaReference`/`Lyrics`/`WordBreakdown`),
  `library.ts` (`SongReference` carries either `youtubeId`, `contentHash`, or both — see §4),
  `lyricsStrategy.ts` (lyrics-strategy contracts: `youtubeId?`, `uploadedAudio?`,
  `manualLyrics?`, see §4).
- `app/stores/` — `song.ts`, `library.ts` (also cleans up orphaned uploaded blobs on song
  removal), `language.ts`, `playerControls.ts`, `processing.ts` (tracks a lyrics-strategy
  run's progress state machine, defaults to the `asr` strategy), `features.ts` (loads backend
  feature-flag state at boot, e.g. whether Musixmatch is enabled).
- `app/components/` — `lyrics/` (LyricsDisplay, LyricLine, WordNode, DraggableWord),
  `player/SongPlayer.vue` (forks on `media.kind`: YouTube IFrame for playback, or a native
  `<audio>` element sourced from the uploaded file — see §4), `library/` (SearchModal — also
  where the "upload your own file" UI lives, LanguageSelector, ScriptToggle), `editor/`
  (LineWordPanel, WordCandidatePanel), `processing/` (LyricsStrategyPicker — also renders the
  no-strategy-available fallback panel, ProcessingProgress).
- `app/pages/` — `index.vue` (Home), `library/index.vue` (Collections),
  `library/[collectionId]/index.vue` (Album — also where "Import course.json" lives),
  `library/[collectionId]/song/[songId].vue` (Song player + on-demand lyrics-strategy
  processing + "Export course" action + "attach audio" fallback).
- `app/services/songApi.ts` / `courseApi.ts` — REST client to the FastAPI backend
  (`/songs/process`, `/songs/{id}`, `/songs/analyze`, `/songs` (store), `/songs/lyrics/fetch`,
  `/songs/youtube/metadata/{id}`, `/songs/{id}/export`, `/songs/import`). `apiClient.ts` wraps
  `$fetch` to attach the owner-token header.
- `app/services/uploadedAudioStore.ts` — hand-rolled IndexedDB wrapper persisting uploaded
  `File`s across reloads, keyed by `content_hash`. `app/utils/fileHash.ts` computes that hash
  client-side (`crypto.subtle.digest('SHA-256', ...)`).
- `app/services/youtubeSearch.ts` — calls `server/api/youtube/search.get.ts` (a Nuxt server
  route), not YouTube directly, so the API key stays server-side. Search/metadata/thumbnail
  only — never a source of audio bytes (see §2).

## 4. In-browser Whisper transcription + lyrics strategies

`app/workers/whisperTranscriber.worker.ts` hosts a `@huggingface/transformers` ASR pipeline
(`Xenova/whisper-base`, `dtype: 'fp32'` forced for cross-browser ONNX compatibility — a
known gotcha, not a stylistic choice). `app/composables/useWhisperClient.ts` is the
main-thread RPC bridge; `useAudioExtraction.ts` wraps ffmpeg.wasm to decode arbitrary
audio/video bytes into mono 16kHz PCM; `useModelCache.ts` exposes Cache-API introspection
and a "clear cached models" action. `app/lyrics-strategies/audioSpeechRuns.ts` is a
lightweight energy-based VAD that snaps rough segment boundaries onto real speech edges.

Lyrics-source strategy is user-selectable (`app/lyrics-strategies/`, picked via
`LyricsStrategyPicker.vue`, orchestrated by `useLyricsPipeline.ts`). `LyricsStrategyInput`
carries `youtubeId?` (present when the song has a YouTube reference) and `uploadedAudio?`
(present once the user has attached their own file) as two independent, optional pieces —
a song can have either, or both (e.g. a YouTube-discovered song the user also attached audio
to, to unlock transcription on it). The picker filters strategies by what's actually
available:

- **ASR** (`asrStrategy.ts`) — pure in-browser Whisper transcription. No lyrics-API
  dependency, real audio-derived timestamps, transcription-error risk on stylized vocals.
  This is the default strategy. Requires `uploadedAudio` — reads the `File`'s bytes directly
  (`file.arrayBuffer()`), no network fetch at all.
- **Legacy** (`legacyStrategy.ts`) — server-side pipeline: yt-dlp metadata, Musixmatch
  lyrics fetch (gated), naive uniform-division timestamps
  (`backend/app/song_processing/service.py::_generate_timestamps`). Fast, no audio sync.
  Requires `youtubeId`. Also supports user-typed manual lyrics (`manualLyrics`), bypassing
  Musixmatch entirely — the fallback offered when no other strategy is available.
- **Hybrid** (`hybridStrategy.ts`) — known-good Musixmatch text aligned to real audio timing
  via Whisper word-level timestamps. Alignment is a pragmatic proportional character-position
  mapping (not full DP/edit-distance forced alignment), finished with the same VAD
  boundary-snap as ASR. Requires **both** `youtubeId` (for the Musixmatch text) and
  `uploadedAudio` (for the audio bytes).

If a song has no `youtubeId` (or the Musixmatch flag is off) and no `uploadedAudio`,
`LyricsStrategyPicker.vue` shows a fallback panel instead of an empty grid: "attach audio
file" (upgrades the existing `SongReference` in place via
`libraryStore.attachAudioToSong`, unlocking ASR/Hybrid without creating a new library entry)
or type lyrics in manually (feeds Legacy's `manualLyrics` path).

**Playback** (`SongPlayer.vue`) forks on `media.kind`: `'youtube'` uses the YouTube IFrame
player exactly as YouTube's own embedding API intends (no download involved); `'upload'`
resolves the file from `uploadedAudioStore` and plays it through a native `<audio>` element
via an object URL. Both paths are wrapped behind the same small set of transport functions
so `usePlayerControlsStore`'s wiring (play/pause/seek/previous-line/next-line) never needs to
know which one is active.

## 5. Backend — FastAPI

`backend/app/word_analysis/` (fugashi/MeCab tokenization, JMDict dictionary lookups,
pykakasi romaji, kanji-compound splitting) is the core NLP layer — no viable browser-side
equivalent exists for this stack. `backend/app/song_processing/` orchestrates the pipeline:
`youtube.py` (yt-dlp **metadata only**, `download=False` — no audio download exists here at
all, see §2), `lyrics.py` (Musixmatch only, gated), `service.py` (orchestration +
word-analysis cache), `repository.py` (persistence), `router.py` (HTTP layer).

Endpoints under `/api/songs` (all owner-token-scoped except `/analyze`, which is stateless):

| Endpoint | Purpose |
|---|---|
| `POST /process` | Legacy pipeline: yt-dlp metadata + Musixmatch fetch (gated) + naive timestamps. 403 if the flag is off and no manual lyrics were supplied. |
| `GET /process/{job_id}` | Poll processing status. |
| `POST /analyze` | Word-analysis only, over client-supplied `{start_time_ms, end_time_ms, text}` lines (ASR/Hybrid). Timestamps pass through untouched. Cached by a hash of the submitted text. |
| `POST /songs` (bare) | Stores a fully client-assembled `Song`, returns `{songId}`. |
| `GET`/`PUT /songs/{id}` | Fetch/update a stored course, owner-scoped. |
| `POST /lyrics/fetch` | Musixmatch text only, no analysis/timestamps (gated, used by Hybrid). |
| `GET /youtube/metadata/{id}` | Cleaned YouTube metadata for strategies that bypass `/process`. |
| `GET /songs/{id}/export` | Portable `course.json` (§2). |
| `POST /songs/import` | Import a `course.json` under the importer's own owner_token. |
| `GET /api/features` | `{legacy_lyrics_enabled}` — frontend reads this at boot to hide the gated strategies. |

There is deliberately no `GET /youtube/audio/{id}` (or any other audio-download endpoint) —
see §2 and `backend/tests/test_no_youtube_download.py`, a regression guard asserting the
relevant methods/route don't exist.

**Persistence**: Supabase-backed (`app/shared/db.py`, `app/song_processing/repository.py`)
when `SUPABASE_URL`/`SUPABASE_KEY` are configured; falls back to an equivalent in-memory
store otherwise (frictionless local dev, data lost on restart — see `migrations/0001_init.sql`
for the `courses`/`processing_cache` schema).

## 6. Third-party services and their terms

- **Musixmatch**: official API, gated off by default. Free tier only returns lyric
  previews — full lyrics require Musixmatch's own commercial license and their approval for
  this specific app. Don't enable `ENABLE_LICENSED_LYRICS_PROVIDERS` unless you've secured that.
- **YouTube**: used only for search (official Data API v3, server-proxied), metadata
  (`yt-dlp`, `download=False`), and playback (official IFrame embed). No audio is ever
  downloaded server-side — YouTube's Terms of Service prohibit third-party download tools
  with no operator-approval path that could make one compliant, unlike Musixmatch above.
- **Supabase**: optional, used purely as a Postgres-compatible data store — no Supabase Auth
  integration exists yet (ownership uses the lighter `owner_token` scheme in §2 instead).

## 7. Before adding a new third-party integration

See `context/legal-constraints.md` first — it has the reasoning behind every decision above
and a checklist for evaluating a new one.
