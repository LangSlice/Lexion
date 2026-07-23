-- Initial schema: courses (Content reference + derived Knowledge) and a
-- content-hash-keyed processing cache. No user/auth table — ownership is a
-- plain opaque token column, not a Postgres identity (see app/shared/db.py).

create table if not exists courses (
  id text primary key,
  owner_token text not null,
  metadata jsonb not null,       -- SongMetadata (derived, no media pointers)
  media jsonb not null,          -- MediaReference (pointer only, never bytes)
  lyrics jsonb not null,         -- Lyrics (the derived-knowledge payload)
  content_hash text,             -- denormalized for quick "already processed?" lookups
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_courses_owner_token on courses (owner_token);
create index if not exists idx_courses_content_hash on courses (content_hash);

-- content_hash here is a hash of the exact lyric TEXT submitted for analysis,
-- not of the source audio (ASR transcription of the same audio isn't
-- guaranteed reproducible run-to-run, so an audio-hash key could serve
-- breakdown/timestamps that don't match the caller's actual transcript —
-- see song_processing/repository.py for the full reasoning).
create table if not exists processing_cache (
  content_hash text not null,
  origin_language text not null,
  target_language text not null,
  lyrics jsonb not null,           -- cached analyzed lines, reusable across song_ids/users
  lyrics_source text,
  lyrics_language text,
  lyrics_confidence real,
  difficulty text,
  created_at timestamptz not null default now(),
  primary key (content_hash, origin_language, target_language)
);
