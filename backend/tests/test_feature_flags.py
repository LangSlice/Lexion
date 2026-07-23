"""
Tests for the ENABLE_LICENSED_LYRICS_PROVIDERS feature flag gating the
Genius/Musixmatch pipeline (off by default per the legal architecture doc).
"""
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from app.main import app
from app.song_processing import router as router_module

client = TestClient(app)


def test_process_song_disabled_by_default_without_manual_lyrics(monkeypatch):
    monkeypatch.setattr(router_module.settings, "ENABLE_LICENSED_LYRICS_PROVIDERS", False)

    response = client.post(
        "/api/songs/process",
        json={
            "youtubeUrl": "https://youtube.com/watch?v=abc123",
            "originLanguage": "ja",
            "targetLanguage": "es",
            "lyrics": None,
        },
        headers={"X-Owner-Token": "owner-a"},
    )

    assert response.status_code == 403
    assert response.json()["detail"]["error"] == "legacy_lyrics_disabled"


def test_process_song_with_manual_lyrics_bypasses_flag(monkeypatch):
    monkeypatch.setattr(router_module.settings, "ENABLE_LICENSED_LYRICS_PROVIDERS", False)
    monkeypatch.setattr(
        router_module.service,
        "process_song",
        AsyncMock(return_value={"songId": "abc12345", "status": "completed", "estimatedTime": 0}),
    )

    response = client.post(
        "/api/songs/process",
        json={
            "youtubeUrl": "https://youtube.com/watch?v=abc123",
            "originLanguage": "ja",
            "targetLanguage": "es",
            "lyrics": ["manual line one", "manual line two"],
        },
        headers={"X-Owner-Token": "owner-a"},
    )

    assert response.status_code == 200
    assert response.json()["songId"] == "abc12345"


def test_process_song_enabled_by_flag(monkeypatch):
    monkeypatch.setattr(router_module.settings, "ENABLE_LICENSED_LYRICS_PROVIDERS", True)
    monkeypatch.setattr(
        router_module.service,
        "process_song",
        AsyncMock(return_value={"songId": "xyz98765", "status": "completed", "estimatedTime": 0}),
    )

    response = client.post(
        "/api/songs/process",
        json={
            "youtubeUrl": "https://youtube.com/watch?v=abc123",
            "originLanguage": "ja",
            "targetLanguage": "es",
            "lyrics": None,
        },
        headers={"X-Owner-Token": "owner-a"},
    )

    assert response.status_code == 200
    assert response.json()["songId"] == "xyz98765"


def test_get_features_reflects_setting(monkeypatch):
    from app import main as main_module

    monkeypatch.setattr(main_module.settings, "ENABLE_LICENSED_LYRICS_PROVIDERS", True)
    response = client.get("/api/features")

    assert response.status_code == 200
    assert response.json() == {"legacy_lyrics_enabled": True}
