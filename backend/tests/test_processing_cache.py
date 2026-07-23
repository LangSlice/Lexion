"""
Tests for the text-hash-keyed word-analysis cache in SongProcessingService.
Keyed by the exact submitted text (not source audio) — see repository.py for
why an audio-hash key would risk mismatched timestamps on ASR transcripts.
"""
from unittest.mock import AsyncMock

import pytest

from app.song_processing.models import TimedLineInput
from app.song_processing.repository import InMemoryProcessingCacheRepository
from app.song_processing.service import SongProcessingService


@pytest.fixture
def service():
    svc = SongProcessingService(cache_repo=InMemoryProcessingCacheRepository())
    svc.word_analysis.analyze_timed_lyrics = AsyncMock(
        return_value=[
            {
                "id": 1,
                "start_time_ms": 0,
                "end_time_ms": 0,
                "text": {"original": "こんにちは", "reading": "こんにちは", "transliteration": "konnichiwa", "translation": "hello"},
                "breakdown": [],
            }
        ]
    )
    return svc


async def test_identical_text_hits_cache_on_second_call(service):
    lines = [TimedLineInput(start_time_ms=100, end_time_ms=500, text="こんにちは")]

    await service.analyze_timed_lines(lines, "ja", "es")
    await service.analyze_timed_lines(lines, "ja", "es")

    assert service.word_analysis.analyze_timed_lyrics.call_count == 1


async def test_cache_hit_still_uses_caller_own_timestamps(service):
    first_lines = [TimedLineInput(start_time_ms=100, end_time_ms=500, text="こんにちは")]
    second_lines = [TimedLineInput(start_time_ms=9000, end_time_ms=9500, text="こんにちは")]

    await service.analyze_timed_lines(first_lines, "ja", "es")
    analyzed, _ = await service.analyze_timed_lines(second_lines, "ja", "es")

    assert analyzed[0]["start_time_ms"] == 9000
    assert analyzed[0]["end_time_ms"] == 9500


async def test_different_text_misses_cache(service):
    lines_a = [TimedLineInput(start_time_ms=100, end_time_ms=500, text="こんにちは")]
    lines_b = [TimedLineInput(start_time_ms=100, end_time_ms=500, text="さようなら")]

    await service.analyze_timed_lines(lines_a, "ja", "es")
    await service.analyze_timed_lines(lines_b, "ja", "es")

    assert service.word_analysis.analyze_timed_lyrics.call_count == 2
