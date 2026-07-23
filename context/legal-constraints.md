# Legal constraints

Read this before adding any integration with a third-party service (a lyrics provider, a
media platform, an AI API, anything that isn't purely your own code). It exists because two
past integrations had to be removed or redesigned after the fact — the goal is to not repeat
that.

## Core principles

- **The product is a language-analysis engine, not a media catalog.** The real asset is the
  derived knowledge (timestamps, word breakdowns, translations, flashcards) — never the
  media itself, and never a browsable index of "what songs exist in this system."
- **Content belongs to the user.** Any audio/video the system processes is the user's own
  responsibility to have rights to. The system never sources media on the user's behalf from
  somewhere it doesn't have a compliant path to.
- **Never rely on a licensed database as the default/primary source.** If an integration
  requires a license or approval to use compliantly, it must be off by default, and the
  primary path must work without it.
- **Cache by content hash, never by song/artist/title identity.** A cache keyed by identity
  is a step away from becoming a public catalog of works. A cache keyed by a hash of the
  actual content is just a computation-reuse optimization.
- **Courses are portable, media is not.** Export/import moves derived knowledge between
  people; it never bundles audio/video bytes, and it redacts verbatim text sourced from a
  licensed provider (the recipient must re-fetch that themselves, under their own credentials).

## Decisions already made (and why)

### Genius — removed entirely, not gated
The `lyricsgenius` library doesn't call an official API — Genius has none for lyrics text —
it scrapes Genius.com pages. That violates Genius's Terms of Service regardless of who runs
it, whether the code is open-source, or whether it's behind a feature flag. There's no
"become an approved partner" path that fixes this, unlike Musixmatch below. **If you see
Genius come back in a diff or a dependency, that's a regression — remove it.**

### Musixmatch — kept, gated behind a flag
Musixmatch has an official API with a real developer-approval process. The free tier only
returns lyric previews; full lyrics require a commercial license and Musixmatch's approval
for the specific app. The *code* isn't illegal — using it without that approval would be. So
it stays in the codebase, off by default (`ENABLE_LICENSED_LYRICS_PROVIDERS=false`), with the
expectation that whoever turns it on has actually secured that approval themselves. See
`backend/app/shared/config.py` and `backend/.env.example`.

### YouTube audio download — removed entirely, not gated
YouTube's Terms of Service explicitly prohibit third-party download tools. Unlike Musixmatch,
there is no operator-approval path that could make a `yt-dlp`-based download compliant — so
this isn't a "gate it behind a flag" situation, it's a "there is no version of this that's
allowed" situation. The fix: `backend/app/song_processing/youtube.py` only ever calls yt-dlp
with `download=False` (metadata, which YouTube's own oEmbed/Data API would give you anyway).
Actual audio bytes for transcription come exclusively from a file the **user uploads
themselves** — read directly in the browser
(`frontend/app/services/uploadedAudioStore.ts`), never touching the backend. YouTube search
(official Data API v3) and playback (official IFrame embed) both stay, since those are
YouTube's own supported, compliant surfaces.

### Ownership token — lightweight, not a full login system
Stored courses are scoped by an opaque per-client `owner_token` header, not a login/account
system. It exists purely to stop a stranger who guesses/obtains a song ID from reading or
overwriting someone else's course — `GET`/`PUT` return 404 (not 403) on a mismatched token,
so a non-owner can't even confirm the ID exists. A real multi-device account system (e.g. via
Supabase Auth) is a legitimate future upgrade, not a requirement.

## Checklist for a new third-party integration

Before writing the code:

1. **Does it have an official API for what you need?** If the only way to get the data is
   scraping/reverse-engineering a page or protocol not meant for that purpose, stop — that's
   the Genius situation, and it doesn't matter how you gate it.
2. **Does it have an approval/licensing path for your use case?** If yes (the Musixmatch
   situation), the integration can exist in the codebase, off by default, with a flag —
   document in the flag's comment exactly what approval is required to turn it on safely.
   If no (the YouTube-audio situation), the integration cannot exist at all, gated or not.
3. **Does it require storing/caching the third party's content?** If so, cache by a hash of
   the actual content, scoped appropriately (shared cache only for things that are genuinely
   provider-agnostic derived data — never for a user's own edited course).
4. **Does it change what gets exported in `course.json`?** If the integration's output is
   licensed text, it must be redacted on export unless the source is the user's own
   transcription/annotation of their own content.
