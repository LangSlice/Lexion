"""
Course persistence — replaces the old in-memory `self.songs` dict with a real
Supabase-backed store (falling back to in-memory when Supabase isn't
configured, so local dev without a Supabase project stays frictionless).

Ownership is enforced here via a plain `owner_token` column, not Postgres RLS
(see app/shared/db.py for why) — every read/write that should be scoped to a
single client goes through get_owned()/update(), never a bare get() by id.
"""
from datetime import datetime, timezone
from typing import Optional, Protocol
import logging

from app.shared.db import get_supabase, supabase_configured
from app.song_processing.models import Song

logger = logging.getLogger(__name__)


class CourseRepository(Protocol):
    async def create(self, course: Song, owner_token: str) -> str: ...
    async def get(self, course_id: str) -> Optional[Song]: ...
    async def get_owned(self, course_id: str, owner_token: str) -> Optional[Song]: ...
    async def update(self, course_id: str, owner_token: str, course: Song) -> Optional[Song]: ...


class InMemoryCourseRepository:
    """Dev fallback — same in-process-dict behavior as the pre-Supabase MVP."""

    def __init__(self):
        self._courses: dict[str, Song] = {}
        self._owners: dict[str, str] = {}

    async def create(self, course: Song, owner_token: str) -> str:
        course_id = course.metadata.id
        self._courses[course_id] = course
        self._owners[course_id] = owner_token
        return course_id

    async def get(self, course_id: str) -> Optional[Song]:
        return self._courses.get(course_id)

    async def get_owned(self, course_id: str, owner_token: str) -> Optional[Song]:
        if self._owners.get(course_id) != owner_token:
            return None
        return self._courses.get(course_id)

    async def update(self, course_id: str, owner_token: str, course: Song) -> Optional[Song]:
        if self._owners.get(course_id) != owner_token:
            return None
        self._courses[course_id] = course
        return course


class SupabaseCourseRepository:
    """Real persistence backed by the `courses` table (see migrations/0001_init.sql)."""

    async def create(self, course: Song, owner_token: str) -> str:
        client = await get_supabase()
        course_id = course.metadata.id
        await client.table("courses").insert({
            "id": course_id,
            "owner_token": owner_token,
            "metadata": course.metadata.model_dump(),
            "media": course.media.model_dump(),
            "lyrics": course.lyrics.model_dump(),
            "content_hash": course.media.content_hash,
        }).execute()
        return course_id

    async def get(self, course_id: str) -> Optional[Song]:
        client = await get_supabase()
        response = await client.table("courses").select("*").eq("id", course_id).limit(1).execute()
        rows = response.data
        return self._row_to_song(rows[0]) if rows else None

    async def get_owned(self, course_id: str, owner_token: str) -> Optional[Song]:
        client = await get_supabase()
        response = (
            await client.table("courses")
            .select("*")
            .eq("id", course_id)
            .eq("owner_token", owner_token)
            .limit(1)
            .execute()
        )
        rows = response.data
        return self._row_to_song(rows[0]) if rows else None

    async def update(self, course_id: str, owner_token: str, course: Song) -> Optional[Song]:
        # Pre-check ownership so a mismatched token reliably reports "not found"
        # rather than silently updating zero rows and returning a false success.
        if await self.get_owned(course_id, owner_token) is None:
            return None

        client = await get_supabase()
        await (
            client.table("courses")
            .update({
                "metadata": course.metadata.model_dump(),
                "media": course.media.model_dump(),
                "lyrics": course.lyrics.model_dump(),
                "content_hash": course.media.content_hash,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
            .eq("id", course_id)
            .eq("owner_token", owner_token)
            .execute()
        )
        return course

    @staticmethod
    def _row_to_song(row: dict) -> Song:
        return Song(metadata=row["metadata"], media=row["media"], lyrics=row["lyrics"])


def get_course_repository() -> CourseRepository:
    if supabase_configured():
        return SupabaseCourseRepository()
    logger.warning(
        "SUPABASE_URL/KEY not set — falling back to in-memory course storage "
        "(data is lost on every restart; fine for local dev, not for production)."
    )
    return InMemoryCourseRepository()


# --- Word-analysis result cache ---
#
# Keyed by a hash of the exact lyric TEXT submitted (not the source audio).
# Audio-hash keying was considered and rejected: ASR transcription of the same
# audio isn't guaranteed byte-for-byte reproducible across runs/users, so
# caching a whole analyzed-lines result under an audio hash risks serving
# breakdown/timestamps that don't correspond to the caller's actual transcript.
# Keying on the text itself means a hit only ever occurs when the submitted
# lines are character-for-character identical to a prior request — same line
# count/order guaranteed, so cached breakdown can be safely re-paired with
# *this* caller's own timestamps (never the cached ones — see service.py).
# Not owner-scoped: it's a pure function of (text, language pair), shared
# across users on purpose (this is the "optimization, not a catalog" cache).

class ProcessingCacheRepository(Protocol):
    async def get(self, text_hash: str, origin_language: str, target_language: str) -> Optional[list]: ...
    async def put(self, text_hash: str, origin_language: str, target_language: str, lines: list) -> None: ...


class InMemoryProcessingCacheRepository:
    def __init__(self):
        self._entries: dict[tuple[str, str, str], list] = {}

    async def get(self, text_hash: str, origin_language: str, target_language: str) -> Optional[list]:
        return self._entries.get((text_hash, origin_language, target_language))

    async def put(self, text_hash: str, origin_language: str, target_language: str, lines: list) -> None:
        self._entries[(text_hash, origin_language, target_language)] = lines


class SupabaseProcessingCacheRepository:
    async def get(self, text_hash: str, origin_language: str, target_language: str) -> Optional[list]:
        client = await get_supabase()
        response = (
            await client.table("processing_cache")
            .select("lyrics")
            .eq("content_hash", text_hash)
            .eq("origin_language", origin_language)
            .eq("target_language", target_language)
            .limit(1)
            .execute()
        )
        rows = response.data
        return rows[0]["lyrics"]["lines"] if rows else None

    async def put(self, text_hash: str, origin_language: str, target_language: str, lines: list) -> None:
        client = await get_supabase()
        await client.table("processing_cache").upsert({
            "content_hash": text_hash,
            "origin_language": origin_language,
            "target_language": target_language,
            "lyrics": {"lines": lines},
        }).execute()


def get_processing_cache_repository() -> ProcessingCacheRepository:
    if supabase_configured():
        return SupabaseProcessingCacheRepository()
    return InMemoryProcessingCacheRepository()
