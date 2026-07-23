"""
Regression guard: the backend must never gain a server-side YouTube audio
download path again. YouTube's Terms of Service prohibit third-party download
tools (yt-dlp included) with no operator-approval path that could make it
compliant — unlike Musixmatch, this can't be fixed by gating it behind a flag,
so it must not exist at all. Transcription requires the user's own uploaded
file instead (read client-side, never touching the backend).
"""
from app.song_processing.service import SongProcessingService
from app.song_processing.youtube import YouTubeService


def test_youtube_service_has_no_download_methods():
    youtube = YouTubeService()
    assert not hasattr(youtube, "fetch_audio_bytes")
    assert not hasattr(youtube, "_download_audio")


def test_service_has_no_fetch_audio_passthrough():
    service = SongProcessingService()
    assert not hasattr(service, "fetch_audio")


def test_no_youtube_audio_route_registered():
    from app.main import app

    paths = {route.path for route in app.routes if hasattr(route, "path")}
    assert "/api/songs/youtube/audio/{youtube_id}" not in paths
