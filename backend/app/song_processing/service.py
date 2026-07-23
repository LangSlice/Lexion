"""
Song processing service - orchestrates the entire pipeline
Coordinates YouTube, lyrics fetching, and word analysis
"""

import hashlib
import uuid
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.shared.config import settings
from app.song_processing.lyrics import LyricsService, detect_lyric_format, LyricsNotFoundException
from app.song_processing.lyrics_conversion import LyricsConversionService
from app.song_processing.models import (
    CourseExport,
    LyricsFetchResponse,
    MediaReferenceExport,
    ProcessingProgress,
    ProcessingStatus,
    ProcessSongResponse,
    Song,
    YoutubeMetadataResponse,
)
from app.song_processing.repository import (
    CourseRepository,
    ProcessingCacheRepository,
    get_course_repository,
    get_processing_cache_repository,
)
from app.song_processing.youtube import YouTubeService
from app.word_analysis.service import WordAnalysisService

logger = logging.getLogger(__name__)


class LyricsNotFoundError(Exception):
    """Business logic error: lyrics not available"""
    def __init__(self, message: str, sources_tried: List[str] = None):
        super().__init__(message)
        self.sources_tried = sources_tried or []


class YouTubeMetadataError(Exception):
    """Business logic error: YouTube metadata unavailable"""
    pass


class SongProcessingService:
    """Main orchestrator for song processing pipeline"""

    def __init__(
        self,
        course_repo: Optional[CourseRepository] = None,
        cache_repo: Optional[ProcessingCacheRepository] = None,
    ):
        self.youtube = YouTubeService()
        self.lyrics = LyricsService()
        self.lyrics_conversion = LyricsConversionService()
        self.word_analysis = WordAnalysisService()
        self.course_repo = course_repo or get_course_repository()
        self.cache_repo = cache_repo or get_processing_cache_repository()
        # Job/progress bookkeeping is ephemeral process state, not user
        # knowledge — no compliance reason to persist it, and doing so would
        # add DB round-trips to a hot polling path for no benefit.
        self.jobs: Dict[str, ProcessingStatus] = {}

    async def process_song(
        self,
        youtube_url: str,
        origin_language: str,
        target_language: str,
        owner_token: str,
        lyrics: Optional[List[str]] = None,
        options: Optional[dict] = None,
    ) -> ProcessSongResponse:
        """
        Process a YouTube song through the full pipeline

        Pipeline stages:
        1. Extract YouTube metadata
        2. Fetch lyrics from Musixmatch
        3. Detect language
        4. Tokenize lyrics
        5. Dictionary lookup for each word
        6. Generate syllable breakdowns
        7. Assemble final JSON
        8. Store in database
        """
        job_id = str(uuid.uuid4())
        song_id = f"{uuid.uuid4().hex[:8]}"

        # Initialize job status
        self.jobs[job_id] = ProcessingStatus(
            jobId=job_id,
            status="processing",
            progress=ProcessingProgress(
                stage="metadata_fetching", percentage=10, message="Fetching YouTube metadata..."
            ),
        )

        try:
            # Stage 1: YouTube metadata
            youtube_id = self._extract_youtube_id(youtube_url)
            metadata = await self.youtube.fetch_metadata(youtube_id)

            logger.info(f"YouTube metadata retrieved: {metadata['title']} by {metadata['artist']}")

            # Update progress
            self._update_progress(job_id, "lyrics_fetching", 25, "Fetching lyrics...")

            # Stage 2: Lyrics fetching
            if lyrics:
                # Use manually provided lyrics
                lyrics_text = lyrics
                lyrics_format, confidence = detect_lyric_format('\n'.join(lyrics_text))
                lyrics_source = 'manual'
                lyrics_metadata = {}
                logger.info(f"Using manual lyrics: {len(lyrics_text)} lines, format={lyrics_format}")
            else:
                # Fetch from external sources
                lyrics_response = await self.fetch_lyrics_only(
                    title=metadata["title"],
                    artist=metadata["artist"],
                    youtube_id=youtube_id,
                    origin_language=origin_language,
                )
                lyrics_text = lyrics_response.lines
                lyrics_format = lyrics_response.format
                confidence = lyrics_response.confidence
                lyrics_source = lyrics_response.source
                lyrics_metadata = {}

            # Update progress
            self._update_progress(job_id, "language_detection", 40, "Confirming language...")

            # Stage 3: Use provided origin language (don't auto-detect)
            language = origin_language
            logger.info(f"Using origin language: {language}")

            # Update progress
            self._update_progress(job_id, "word_analysis", 50, "Analyzing words...")

            # Stage 4-6: Word analysis (tokenization + dictionary + syllables)
            lyrics_analyzed = await self.word_analysis.analyze_lyrics(
                lyrics_text=lyrics_text, language=language, target_language=target_language
            )

            logger.debug(f"Lyrics analyzed: {len(lyrics_analyzed)} lines processed")


            # Update progress
            self._update_progress(job_id, "timestamp_generation", 80, "Generating timestamps...")

            # Stage 7: Generate timestamps (simple estimation for MVP)
            lyrics_with_timestamps = self._generate_timestamps(
                lyrics_analyzed, duration_ms=metadata["duration_ms"]
            )

            # Update progress
            self._update_progress(job_id, "assembly", 90, "Assembling song data...")

            # Stage 8: Assemble final song object
            song = Song(
                metadata={
                    "id": song_id,
                    "title": metadata["title"],
                    "title_romaji": metadata.get("title_romaji", ""),
                    "title_translation": metadata.get("title_translation", ""),
                    "artist": metadata["artist"],
                    "album": metadata.get("album", ""),
                    "duration_ms": metadata["duration_ms"],
                    "language": language,  # Origin language (user's learning target)
                    "lyrics_language": lyrics_format,  # Actual format of retrieved lyrics
                    "lyrics_source": lyrics_source,  # Source: 'musixmatch'|'asr'|'manual'
                    "lyrics_confidence": confidence,  # 0.0-1.0 confidence in format detection
                    "tags": metadata.get("tags", []),
                    "difficulty": self._estimate_difficulty(lyrics_analyzed),
                    "release_year": metadata.get("release_year", 2024),
                },
                media={
                    "kind": "youtube",
                    "youtube_id": youtube_id,
                    "spotify_id": metadata.get("spotify_id", ""),
                },
                lyrics={"lines": lyrics_with_timestamps},
            )

            # Store song
            await self.course_repo.create(song, owner_token)

            # Update to completed
            self._update_progress(job_id, "completed", 100, "Processing complete!")
            self.jobs[job_id].status = "completed"

            return ProcessSongResponse(songId=song_id, status="completed", estimatedTime=0)

        except Exception as e:
            # Mark job as failed
            self.jobs[job_id].status = "failed"
            self.jobs[job_id].progress.message = f"Error: {str(e)}"
            raise

    async def fetch_lyrics_only(
        self, title: str, artist: str, youtube_id: str, origin_language: str = "ja"
    ) -> LyricsFetchResponse:
        """
        Fetch lyrics text from Musixmatch only — no word-analysis, no
        timestamps. Used by both the Legacy pipeline (process_song) and the
        Hybrid strategy's standalone /lyrics/fetch endpoint.
        """
        try:
            lyrics_result = await self.lyrics.fetch_lyrics(
                title=title, artist=artist, youtube_id=youtube_id
            )

            logger.info(
                f"Fetched lyrics from {lyrics_result.source}: {len(lyrics_result.lines)} lines, "
                f"format={lyrics_result.format}, confidence={lyrics_result.confidence:.2f}"
            )

            converted_from_romaji = False

            # Romaji is useless as a script-learning reference — convert to kana
            # deterministically (no LLM) when the origin language is Japanese.
            if (
                settings.ENABLE_ROMAJI_CONVERSION
                and origin_language == 'ja'
                and lyrics_result.format in ('romaji', 'mixed')
            ):
                conversion = self.lyrics_conversion.convert_romaji_lines_to_kana(lyrics_result.lines)
                if conversion.converted:
                    lyrics_result.lines = conversion.lines
                    lyrics_result.format = 'japanese'
                    converted_from_romaji = True
                    logger.info("Converted romaji lyrics to kana for alignment/study reference")
                else:
                    logger.warning(
                        "Format mismatch: Expected Japanese, got romaji, and conversion did not apply."
                    )
            elif lyrics_result.format == 'mixed':
                logger.info("Mixed format detected (common in J-pop)")

            return LyricsFetchResponse(
                lines=lyrics_result.lines,
                format=lyrics_result.format,
                confidence=lyrics_result.confidence,
                source=lyrics_result.source,
                converted_from_romaji=converted_from_romaji,
            )

        except LyricsNotFoundException as e:
            logger.error(f"Lyrics not found: {e}")
            raise LyricsNotFoundError(
                f"Could not find lyrics for '{title}' by {artist}",
                sources_tried=e.sources_tried
            ) from e

    async def analyze_timed_lines(
        self, timed_lines: list, language: str, target_language: str
    ) -> tuple:
        """
        Run word-analysis over client-supplied timed lines (ASR/Hybrid strategies).
        Client timestamps are preserved verbatim — _generate_timestamps is never called.

        Word-analysis (breakdown/translation) is a deterministic function of the
        text+language pair, so it's cached by a hash of the exact submitted text —
        a cache hit only ever occurs on a character-for-character-identical
        transcript, so the cached breakdown is always re-paired with *this*
        caller's own timestamps below, never the cached ones.

        Returns:
            (analyzed_lines, estimated_difficulty)
        """
        text_hash = self._hash_lines_text(timed_lines)
        cached_lines = await self.cache_repo.get(text_hash, language, target_language)

        if cached_lines is not None:
            analyzed_lines = [
                {**cached_line, "start_time_ms": timed.start_time_ms, "end_time_ms": timed.end_time_ms}
                for cached_line, timed in zip(cached_lines, timed_lines)
            ]
        else:
            analyzed_lines = await self.word_analysis.analyze_timed_lyrics(
                timed_lines=[line.dict() for line in timed_lines],
                language=language,
                target_language=target_language,
            )
            await self.cache_repo.put(text_hash, language, target_language, analyzed_lines)

        difficulty = self._estimate_difficulty(analyzed_lines)
        return analyzed_lines, difficulty

    @staticmethod
    def _hash_lines_text(timed_lines: list) -> str:
        joined = "\n".join(line.text for line in timed_lines)
        return hashlib.sha256(joined.encode("utf-8")).hexdigest()

    async def store_song(self, song: Song, owner_token: str) -> str:
        """Store a fully client-assembled Song (ASR/Hybrid strategies), return its id"""
        song_id = song.metadata.id or f"{uuid.uuid4().hex[:8]}"
        song.metadata.id = song_id
        await self.course_repo.create(song, owner_token)
        logger.info(f"Song {song_id} stored: {len(song.lyrics.lines)} lines")
        return song_id

    async def get_youtube_metadata(self, youtube_id: str) -> dict:
        """Fetch cleaned YouTube metadata (title/artist stripped of channel/video-title noise)"""
        return await self.youtube.fetch_metadata(youtube_id)

    async def get_status(self, job_id: str) -> Optional[ProcessingStatus]:
        """Get processing status for a job"""
        return self.jobs.get(job_id)

    async def get_song(self, song_id: str, owner_token: str) -> Optional[Song]:
        """Get processed song by ID, scoped to its owner"""
        return await self.course_repo.get_owned(song_id, owner_token)

    async def update_song(self, song_id: str, owner_token: str, updates) -> Optional[Song]:
        """
        Update an existing song with user edits

        Args:
            song_id: Song ID to update
            owner_token: Must match the song's owner, or the update is rejected
            updates: SongUpdateRequest with changes

        Returns:
            Updated Song or None if not found (or not owned by this token)
        """
        current_song = await self.course_repo.get_owned(song_id, owner_token)
        if current_song is None:
            logger.warning(f"Song {song_id} not found (or not owned) for update")
            return None

        # Update metadata if provided
        if updates.metadata:
            current_song.metadata = updates.metadata

        # Update lyrics if provided
        if updates.lyrics:
            # Validate lyrics structure
            if not updates.lyrics.lines or len(updates.lyrics.lines) == 0:
                raise ValueError("Lyrics must have at least one line")

            # Update lyrics
            current_song.lyrics = updates.lyrics

        updated_song = await self.course_repo.update(song_id, owner_token, current_song)

        logger.info(f"Song {song_id} updated: {len(current_song.lyrics.lines)} lines")

        return updated_song

    # Lyrics text sourced from a licensed provider must never leave the server
    # verbatim in a shared export — see export_course below.
    LICENSED_LYRICS_SOURCES = {"musixmatch"}

    async def export_course(self, song_id: str, owner_token: str) -> Optional[CourseExport]:
        """Build a portable course.json for a stored course, owner-scoped."""
        song = await self.course_repo.get_owned(song_id, owner_token)
        if song is None:
            return None

        redact = song.metadata.lyrics_source in self.LICENSED_LYRICS_SOURCES
        lines = song.lyrics.lines
        if redact:
            # Strip the verbatim licensed text but keep everything the user's
            # own analysis actually added — translations, explanations, word
            # breakdown, timestamps, phrase groups. The recipient must re-fetch
            # the original text themselves (with the flag enabled) if they want it.
            lines = [
                line.model_copy(update={"text": line.text.model_copy(update={"original": "", "reading": ""})})
                for line in lines
            ]

        return CourseExport(
            metadata=song.metadata,
            media_reference=MediaReferenceExport(
                kind=song.media.kind,
                youtube_id=song.media.youtube_id,
                spotify_id=song.media.spotify_id,
                content_hash=song.media.content_hash,
            ),
            lyrics={"lines": lines},
            redacted_licensed_text=redact,
            exported_at=datetime.now(timezone.utc).isoformat(),
        )

    async def import_course(self, export: CourseExport, owner_token: str) -> str:
        """Import a previously-exported course.json under a new owner, with a fresh id."""
        song_id = f"{uuid.uuid4().hex[:8]}"
        song = Song(
            metadata=export.metadata.model_copy(update={"id": song_id}),
            media={
                "kind": export.media_reference.kind,
                "youtube_id": export.media_reference.youtube_id,
                "spotify_id": export.media_reference.spotify_id,
                "content_hash": export.media_reference.content_hash,
            },
            lyrics=export.lyrics,
        )
        await self.course_repo.create(song, owner_token)
        return song_id

    def _extract_youtube_id(self, url: str) -> str:
        """Extract YouTube video ID from URL"""
        # Handle different YouTube URL formats
        if "youtu.be/" in url:
            return url.split("youtu.be/")[1].split("?")[0]
        elif "watch?v=" in url:
            return url.split("watch?v=")[1].split("&")[0]
        else:
            raise ValueError(f"Invalid YouTube URL: {url}")

    def _update_progress(self, job_id: str, stage: str, percentage: int, message: str):
        """Update job progress"""
        if job_id in self.jobs:
            self.jobs[job_id].progress = ProcessingProgress(
                stage=stage, percentage=percentage, message=message
            )

    def _generate_timestamps(self, lyrics_lines: list, duration_ms: int) -> list:
        """Generate estimated timestamps for lyrics lines (MVP simple estimation)"""
        num_lines = len(lyrics_lines)
        if num_lines == 0:
            return []

        time_per_line = duration_ms / num_lines

        for i, line in enumerate(lyrics_lines):
            line["id"] = i + 1
            line["start_time_ms"] = int(i * time_per_line)
            line["end_time_ms"] = int((i + 1) * time_per_line)

        return lyrics_lines

    def _estimate_difficulty(self, lyrics_lines: list) -> str:
        """Estimate song difficulty based on word complexity"""
        # Simple heuristic: count kanji characters vs total characters
        total_chars = 0
        kanji_count = 0

        for line in lyrics_lines:
            for word in line.get("breakdown", []):
                if word.get("script_type") == "kanji":
                    kanji_count += len(word.get("text", ""))
                total_chars += len(word.get("text", ""))

        if total_chars == 0:
            return "beginner"

        kanji_ratio = kanji_count / total_chars

        if kanji_ratio < 0.2:
            return "beginner"
        elif kanji_ratio < 0.4:
            return "intermediate"
        else:
            return "advanced"
