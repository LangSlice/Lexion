"""
Regression tests for WordAnalysisService.analyze_timed_lyrics — the seam that
lets client-side (Whisper) timestamps flow through word-analysis untouched,
instead of being overwritten by the server's naive uniform-division estimate.
"""
import pytest

from app.word_analysis.service import WordAnalysisService


@pytest.fixture
def service():
    return WordAnalysisService()


async def test_timestamps_pass_through_verbatim(service):
    timed_lines = [
        {"start_time_ms": 1234, "end_time_ms": 5678, "text": "こんにちは"},
        {"start_time_ms": 5678, "end_time_ms": 9000, "text": "さよなら"},
    ]

    analyzed = await service.analyze_timed_lyrics(timed_lines, language="ja", target_language="es")

    assert len(analyzed) == 2
    assert analyzed[0]["start_time_ms"] == 1234
    assert analyzed[0]["end_time_ms"] == 5678
    assert analyzed[1]["start_time_ms"] == 5678
    assert analyzed[1]["end_time_ms"] == 9000


async def test_ids_are_sequential_and_one_indexed(service):
    timed_lines = [
        {"start_time_ms": 0, "end_time_ms": 1000, "text": "一"},
        {"start_time_ms": 1000, "end_time_ms": 2000, "text": "二"},
        {"start_time_ms": 2000, "end_time_ms": 3000, "text": "三"},
    ]

    analyzed = await service.analyze_timed_lyrics(timed_lines, language="ja", target_language="es")

    assert [line["id"] for line in analyzed] == [1, 2, 3]


async def test_empty_lines_are_skipped_and_ids_stay_contiguous(service):
    timed_lines = [
        {"start_time_ms": 0, "end_time_ms": 1000, "text": "一"},
        {"start_time_ms": 1000, "end_time_ms": 2000, "text": "   "},
        {"start_time_ms": 2000, "end_time_ms": 3000, "text": "二"},
    ]

    analyzed = await service.analyze_timed_lyrics(timed_lines, language="ja", target_language="es")

    assert len(analyzed) == 2
    assert [line["id"] for line in analyzed] == [1, 2]
    assert analyzed[1]["start_time_ms"] == 2000


async def test_breakdown_matches_analyze_lyrics_for_same_text(service):
    """analyze_timed_lyrics must reuse the same per-line analysis as analyze_lyrics,
    only swapping how timestamps are attached."""
    text = "日本語"

    via_timed = await service.analyze_timed_lyrics(
        [{"start_time_ms": 0, "end_time_ms": 1000, "text": text}], language="ja", target_language="es"
    )
    via_untimed = await service.analyze_lyrics([text], language="ja", target_language="es")

    assert via_timed[0]["text"]["original"] == via_untimed[0]["text"]["original"]
    assert via_timed[0]["breakdown"] == via_untimed[0]["breakdown"]


async def test_non_japanese_falls_back_to_simple_line(service):
    timed_lines = [{"start_time_ms": 0, "end_time_ms": 1000, "text": "hello world"}]

    analyzed = await service.analyze_timed_lyrics(timed_lines, language="en", target_language="es")

    assert analyzed[0]["text"]["original"] == "hello world"
    assert analyzed[0]["breakdown"] == []
    assert analyzed[0]["start_time_ms"] == 0
    assert analyzed[0]["end_time_ms"] == 1000
