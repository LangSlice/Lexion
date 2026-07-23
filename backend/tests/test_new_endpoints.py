"""
Tests for the new /api/songs endpoints that support client-driven (ASR/Hybrid)
lyrics strategies: /analyze, POST /songs (store), /lyrics/fetch,
/youtube/metadata/{id}.

External calls (yt-dlp, Musixmatch) are mocked at the service layer —
these tests exercise routing/serialization, not the third-party integrations.
"""
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.song_processing import router as router_module
from app.song_processing.models import LyricsFetchResponse

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_mocks():
    """Ensure each test starts with a clean service mock surface."""
    yield


def test_analyze_lyrics_returns_annotated_lines(monkeypatch):
    monkeypatch.setattr(
        router_module.service,
        "analyze_timed_lines",
        AsyncMock(
            return_value=(
                [
                    {
                        "id": 1,
                        "start_time_ms": 100,
                        "end_time_ms": 500,
                        "text": {
                            "original": "こんにちは",
                            "reading": "こんにちは",
                            "transliteration": "konnichiwa",
                            "translation": "",
                            "explanation": "",
                        },
                        "breakdown": [],
                    }
                ],
                "beginner",
            )
        ),
    )

    response = client.post(
        "/api/songs/analyze",
        json={
            "lines": [{"start_time_ms": 100, "end_time_ms": 500, "text": "こんにちは"}],
            "language": "ja",
            "target_language": "es",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["estimated_difficulty"] == "beginner"
    assert body["lines"][0]["start_time_ms"] == 100
    assert body["lines"][0]["end_time_ms"] == 500


def test_store_song_returns_song_id(monkeypatch):
    monkeypatch.setattr(router_module.service, "store_song", AsyncMock(return_value="abc12345"))

    song_payload = {
        "metadata": {
            "id": "",
            "title": "Test Song",
            "title_romaji": "",
            "title_translation": "",
            "artist": "Test Artist",
            "album": "",
            "duration_ms": 180000,
            "language": "ja",
            "lyrics_language": "japanese",
            "lyrics_source": "asr",
            "lyrics_confidence": 0.9,
            "tags": [],
            "difficulty": "beginner",
            "release_year": 2024,
        },
        "media": {"kind": "youtube", "youtube_id": "xyz123", "spotify_id": ""},
        "lyrics": {"lines": []},
    }

    response = client.post(
        "/api/songs", json={"song": song_payload}, headers={"X-Owner-Token": "owner-a"}
    )

    assert response.status_code == 200
    assert response.json() == {"songId": "abc12345"}


def test_fetch_lyrics_returns_text_only(monkeypatch):
    # Licensed lyrics providers are gated off by default — enable for this test.
    monkeypatch.setattr(router_module.settings, "ENABLE_LICENSED_LYRICS_PROVIDERS", True)
    monkeypatch.setattr(
        router_module.service,
        "fetch_lyrics_only",
        AsyncMock(
            return_value=LyricsFetchResponse(
                lines=["line one", "line two"], format="japanese", confidence=0.8, source="musixmatch"
            )
        ),
    )

    response = client.post(
        "/api/songs/lyrics/fetch", json={"title": "Song", "artist": "Artist", "youtube_id": "abc"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["lines"] == ["line one", "line two"]
    assert body["source"] == "musixmatch"


def test_fetch_lyrics_disabled_by_default(monkeypatch):
    monkeypatch.setattr(router_module.settings, "ENABLE_LICENSED_LYRICS_PROVIDERS", False)

    response = client.post(
        "/api/songs/lyrics/fetch", json={"title": "Song", "artist": "Artist", "youtube_id": "abc"}
    )

    assert response.status_code == 403
    assert response.json()["detail"]["error"] == "legacy_lyrics_disabled"


def test_get_youtube_metadata(monkeypatch):
    monkeypatch.setattr(
        router_module.service,
        "get_youtube_metadata",
        AsyncMock(
            return_value={
                "title": "Clean Title",
                "artist": "Clean Artist",
                "album": "",
                "duration_ms": 200000,
                "youtube_id": "vid123",
                "tags": ["pop"],
                "release_year": 2023,
            }
        ),
    )

    response = client.get("/api/songs/youtube/metadata/vid123")

    assert response.status_code == 200
    assert response.json()["title"] == "Clean Title"
