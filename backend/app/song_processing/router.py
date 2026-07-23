"""
Song processing API router
Handles YouTube URL → processed song JSON
"""
from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import JSONResponse
import logging

from app.song_processing.models import (
    AnalyzeLyricsRequest,
    AnalyzeLyricsResponse,
    CourseExport,
    ImportCourseRequest,
    LyricsFetchRequest,
    LyricsFetchResponse,
    ProcessSongRequest,
    ProcessSongResponse,
    ProcessingStatus,
    Song,
    SongUpdateRequest,
    StoreSongRequest,
    StoreSongResponse,
    YoutubeMetadataResponse,
)
from app.song_processing.service import (
    SongProcessingService,
    LyricsNotFoundError,
    YouTubeMetadataError
)
from app.shared.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()
service = SongProcessingService()


async def get_owner_token(x_owner_token: str = Header(..., alias="X-Owner-Token")) -> str:
    """
    Opaque per-client token (client-generated UUID, see frontend/app/utils/ownerToken.ts)
    scoping course reads/writes. Not a login system — just prevents a stranger who
    obtains/guesses a song_id from reading or overwriting someone else's course.
    """
    return x_owner_token


@router.post("/process", response_model=ProcessSongResponse)
async def process_song(request: ProcessSongRequest, owner_token: str = Depends(get_owner_token)):
    """
    Process a YouTube URL to generate word breakdowns

    HTTP Status Codes:
    - 200: Processing started successfully
    - 400: Invalid request (bad URL, invalid language code)
    - 404: Lyrics not found for this song
    - 500: Internal server error (database, API down)

    Pipeline:
    1. Fetch metadata from YouTube
    2. Fetch lyrics from Musixmatch
    3. Detect lyrics language/format
    4. Tokenize and analyze words
    5. Generate word breakdowns
    6. Store in database
    """
    if not request.lyrics and not settings.ENABLE_LICENSED_LYRICS_PROVIDERS:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "legacy_lyrics_disabled",
                "message": "Musixmatch lyrics fetching is disabled by default.",
                "suggestion": "Use the ASR strategy, or supply manual lyrics.",
            }
        )

    try:
        result = await service.process_song(
            youtube_url=request.youtubeUrl,
            origin_language=request.originLanguage,
            target_language=request.targetLanguage,
            owner_token=owner_token,
            lyrics=request.lyrics,
            options=request.options
        )
        return result

    except LyricsNotFoundError as e:
        # 404: Resource not found (lyrics don't exist)
        logger.warning(f"Lyrics not found: {e}")
        raise HTTPException(
            status_code=404,
            detail={
                "error": "lyrics_not_found",
                "message": str(e),
                "sources_tried": e.sources_tried,
                "suggestion": "Try providing manual lyrics or use a different song"
            }
        )

    except YouTubeMetadataError as e:
        # 404: YouTube video not found or unavailable
        logger.warning(f"YouTube metadata error: {e}")
        raise HTTPException(
            status_code=404,
            detail={
                "error": "youtube_not_found",
                "message": str(e),
                "suggestion": "Check the YouTube URL and ensure the video is public"
            }
        )

    except ValueError as e:
        # 400: Invalid input (bad URL format, invalid language code)
        logger.warning(f"Invalid request: {e}")
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_request", "message": str(e)}
        )

    except Exception as e:
        # 500: Unexpected server error
        logger.error(f"Unexpected error processing song: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "internal_error",
                "message": "An unexpected error occurred while processing the song",
                "debug": str(e) if settings.DEBUG else None
            }
        )


@router.get("/process/{job_id}", response_model=ProcessingStatus)
async def get_processing_status(job_id: str):
    """Get processing status for a job"""
    try:
        status = await service.get_status(job_id)
        if not status:
            raise HTTPException(status_code=404, detail="Job not found")
        return status
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze", response_model=AnalyzeLyricsResponse)
async def analyze_lyrics(request: AnalyzeLyricsRequest):
    """
    Run word-analysis only over client-supplied timed lines (ASR/Hybrid strategies).
    Client timestamps are preserved verbatim — no timestamp generation happens here.
    """
    try:
        lines, difficulty = await service.analyze_timed_lines(
            timed_lines=request.lines,
            language=request.language,
            target_language=request.target_language,
        )
        return AnalyzeLyricsResponse(lines=lines, estimated_difficulty=difficulty)
    except Exception as e:
        logger.error(f"Error analyzing timed lyrics: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={"error": "internal_error", "message": str(e)}
        )


@router.post("", response_model=StoreSongResponse)
async def store_song(request: StoreSongRequest, owner_token: str = Depends(get_owner_token)):
    """Store a fully client-assembled song (ASR/Hybrid strategies, after /analyze)"""
    try:
        song_id = await service.store_song(request.song, owner_token)
        return StoreSongResponse(songId=song_id)
    except Exception as e:
        logger.error(f"Error storing song: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={"error": "internal_error", "message": str(e)}
        )


@router.post("/lyrics/fetch", response_model=LyricsFetchResponse)
async def fetch_lyrics(request: LyricsFetchRequest):
    """Fetch known-good lyrics text only (no analysis, no timestamps) — used by the Hybrid strategy"""
    if not settings.ENABLE_LICENSED_LYRICS_PROVIDERS:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "legacy_lyrics_disabled",
                "message": "Musixmatch lyrics fetching is disabled by default.",
                "suggestion": "Use the ASR strategy, or supply manual lyrics.",
            }
        )

    try:
        return await service.fetch_lyrics_only(
            title=request.title,
            artist=request.artist,
            youtube_id=request.youtube_id,
            origin_language=request.origin_language,
        )
    except LyricsNotFoundError as e:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "lyrics_not_found",
                "message": str(e),
                "sources_tried": e.sources_tried,
            }
        )
    except Exception as e:
        logger.error(f"Error fetching lyrics: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={"error": "internal_error", "message": str(e)}
        )


@router.get("/youtube/metadata/{youtube_id}", response_model=YoutubeMetadataResponse)
async def get_youtube_metadata(youtube_id: str):
    """Cleaned YouTube metadata (title/artist), for strategies that bypass /process"""
    try:
        metadata = await service.get_youtube_metadata(youtube_id)
        return YoutubeMetadataResponse(**metadata)
    except Exception as e:
        logger.error(f"Error fetching YouTube metadata: {e}", exc_info=True)
        raise HTTPException(
            status_code=404,
            detail={
                "error": "youtube_not_found",
                "message": str(e),
                "suggestion": "Check the video ID and ensure the video is public"
            }
        )


@router.get("/{song_id}", response_model=Song)
async def get_song(song_id: str, owner_token: str = Depends(get_owner_token)):
    """
    Get processed song by ID, scoped to its owner.

    Returns 404 (not 403) when the song exists but belongs to a different
    owner_token — this avoids confirming to a stranger that a given ID exists.
    """
    try:
        song = await service.get_song(song_id, owner_token)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    return song


@router.put("/{song_id}", response_model=Song)
async def update_song(song_id: str, updates: SongUpdateRequest, owner_token: str = Depends(get_owner_token)):
    """
    Update an existing song's lyrics, timestamps, or translations (owner-scoped)

    Allows users to manually correct:
    - Lyric text (original, translation, transliteration)
    - Timestamps (start_time_ms, end_time_ms)
    - Add/remove lines

    HTTP Status Codes:
    - 200: Song updated successfully
    - 404: Song not found (or not owned by this token)
    - 400: Invalid update data
    """
    try:
        updated_song = await service.update_song(song_id, owner_token, updates)
    except ValueError as e:
        logger.warning(f"Invalid update request: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating song {song_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={"error": "internal_error", "message": str(e)}
        )

    if not updated_song:
        raise HTTPException(status_code=404, detail="Song not found")

    logger.info(f"Song {song_id} updated successfully")
    return updated_song


@router.get("/{song_id}/export", response_model=CourseExport)
async def export_course(song_id: str, owner_token: str = Depends(get_owner_token)):
    """
    Export a stored course as a portable course.json — knowledge only, never
    the source media. Licensed-provider lyrics text is redacted (see
    service.export_course); ASR/manual transcriptions are exported as-is.
    """
    try:
        export = await service.export_course(song_id, owner_token)
    except Exception as e:
        logger.error(f"Error exporting course {song_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail={"error": "internal_error", "message": str(e)})

    if not export:
        raise HTTPException(status_code=404, detail="Song not found")

    return JSONResponse(
        content=export.model_dump(),
        headers={"Content-Disposition": 'attachment; filename="course.json"'},
    )


@router.post("/import", response_model=StoreSongResponse)
async def import_course(request: ImportCourseRequest, owner_token: str = Depends(get_owner_token)):
    """Import a previously-exported course.json, stored fresh under the importer's own owner_token"""
    try:
        song_id = await service.import_course(request.course, owner_token)
        return StoreSongResponse(songId=song_id)
    except Exception as e:
        logger.error(f"Error importing course: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail={"error": "internal_error", "message": str(e)})
