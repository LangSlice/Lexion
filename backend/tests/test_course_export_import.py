"""
Tests for portable course.json export/import — knowledge only, never media,
and licensed-provider lyrics text redacted on export (see service.export_course).
"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _store(lyrics_source: str, owner_token: str = "owner-a", media: dict | None = None) -> str:
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
            "lyrics_source": lyrics_source,
            "lyrics_confidence": 0.9,
            "tags": [],
            "difficulty": "beginner",
            "release_year": 2024,
        },
        "media": media or {"kind": "youtube", "youtube_id": "xyz123", "spotify_id": ""},
        "lyrics": {
            "lines": [
                {
                    "id": 1,
                    "start_time_ms": 0,
                    "end_time_ms": 1000,
                    "text": {
                        "original": "こんにちは",
                        "reading": "こんにちは",
                        "transliteration": "konnichiwa",
                        "translation": "hello",
                        "explanation": "a greeting",
                    },
                    "breakdown": [],
                }
            ]
        },
    }
    response = client.post(
        "/api/songs", json={"song": song_payload}, headers={"X-Owner-Token": owner_token}
    )
    assert response.status_code == 200
    return response.json()["songId"]


def test_asr_course_exports_with_full_text():
    song_id = _store("asr")

    response = client.get(f"/api/songs/{song_id}/export", headers={"X-Owner-Token": "owner-a"})

    assert response.status_code == 200
    body = response.json()
    assert body["redacted_licensed_text"] is False
    assert body["lyrics"]["lines"][0]["text"]["original"] == "こんにちは"
    assert body["lyrics"]["lines"][0]["text"]["translation"] == "hello"
    assert "media" not in body  # media bytes never included; only media_reference pointer
    assert body["media_reference"]["youtube_id"] == "xyz123"


def test_musixmatch_course_redacts_verbatim_text_but_keeps_translation():
    song_id = _store("musixmatch")

    response = client.get(f"/api/songs/{song_id}/export", headers={"X-Owner-Token": "owner-a"})

    assert response.status_code == 200
    body = response.json()
    assert body["redacted_licensed_text"] is True
    assert body["lyrics"]["lines"][0]["text"]["original"] == ""
    assert body["lyrics"]["lines"][0]["text"]["reading"] == ""
    assert body["lyrics"]["lines"][0]["text"]["translation"] == "hello"
    assert body["lyrics"]["lines"][0]["text"]["explanation"] == "a greeting"


def test_upload_course_content_hash_survives_export_import():
    upload_media = {"kind": "upload", "youtube_id": "", "spotify_id": "", "content_hash": "abc123hash"}
    song_id = _store("asr", owner_token="owner-a", media=upload_media)

    export = client.get(f"/api/songs/{song_id}/export", headers={"X-Owner-Token": "owner-a"}).json()
    assert export["media_reference"]["kind"] == "upload"
    assert export["media_reference"]["content_hash"] == "abc123hash"

    response = client.post(
        "/api/songs/import", json={"course": export}, headers={"X-Owner-Token": "owner-c"}
    )
    assert response.status_code == 200
    new_song_id = response.json()["songId"]

    imported = client.get(f"/api/songs/{new_song_id}", headers={"X-Owner-Token": "owner-c"}).json()
    assert imported["media"]["kind"] == "upload"
    assert imported["media"]["content_hash"] == "abc123hash"


def test_export_requires_ownership():
    song_id = _store("asr")

    response = client.get(f"/api/songs/{song_id}/export", headers={"X-Owner-Token": "owner-b"})

    assert response.status_code == 404


def test_import_creates_new_song_under_importer_owner():
    song_id = _store("asr", owner_token="owner-a")
    export = client.get(f"/api/songs/{song_id}/export", headers={"X-Owner-Token": "owner-a"}).json()

    response = client.post(
        "/api/songs/import", json={"course": export}, headers={"X-Owner-Token": "owner-c"}
    )

    assert response.status_code == 200
    new_song_id = response.json()["songId"]
    assert new_song_id != song_id

    # Importer owns it now
    imported = client.get(f"/api/songs/{new_song_id}", headers={"X-Owner-Token": "owner-c"})
    assert imported.status_code == 200
    assert imported.json()["lyrics"]["lines"][0]["text"]["original"] == "こんにちは"

    # Original owner's song is untouched and still separate
    original_owner_check = client.get(f"/api/songs/{new_song_id}", headers={"X-Owner-Token": "owner-a"})
    assert original_owner_check.status_code == 404
