"""
Tests for the lightweight owner-token scoping on stored courses (no login
system — just an opaque per-client token so a guessed/leaked song_id doesn't
expose someone else's stored lyrics/analysis).
"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

MINIMAL_SONG = {
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


def _store_as(owner_token: str) -> str:
    response = client.post(
        "/api/songs", json={"song": MINIMAL_SONG}, headers={"X-Owner-Token": owner_token}
    )
    assert response.status_code == 200
    return response.json()["songId"]


def test_store_without_owner_token_header_rejected():
    response = client.post("/api/songs", json={"song": MINIMAL_SONG})
    assert response.status_code == 422  # missing required header


def test_owner_can_read_their_own_song():
    song_id = _store_as("owner-a")

    response = client.get(f"/api/songs/{song_id}", headers={"X-Owner-Token": "owner-a"})

    assert response.status_code == 200
    assert response.json()["metadata"]["title"] == "Test Song"


def test_other_owner_gets_404_not_403():
    song_id = _store_as("owner-a")

    response = client.get(f"/api/songs/{song_id}", headers={"X-Owner-Token": "owner-b"})

    assert response.status_code == 404


def test_other_owner_cannot_update():
    song_id = _store_as("owner-a")
    updates = {"metadata": {**MINIMAL_SONG["metadata"], "id": song_id, "title": "Hacked Title"}}

    response = client.put(
        f"/api/songs/{song_id}", json=updates, headers={"X-Owner-Token": "owner-b"}
    )

    assert response.status_code == 404

    # Confirm no mutation occurred
    check = client.get(f"/api/songs/{song_id}", headers={"X-Owner-Token": "owner-a"})
    assert check.json()["metadata"]["title"] == "Test Song"


def test_owner_can_update_their_own_song():
    song_id = _store_as("owner-a")
    updates = {"metadata": {**MINIMAL_SONG["metadata"], "id": song_id, "title": "Updated Title"}}

    response = client.put(
        f"/api/songs/{song_id}", json=updates, headers={"X-Owner-Token": "owner-a"}
    )

    assert response.status_code == 200
    assert response.json()["metadata"]["title"] == "Updated Title"
