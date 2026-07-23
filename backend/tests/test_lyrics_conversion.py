"""
Tests for lyrics_conversion.LyricsConversionService — deterministic romaji->kana
conversion for JP lyrics fetched in romanized form (see the "Format mismatch:
Expected Japanese, got romaji" warning this fulfills in service.py).
"""
from unittest.mock import AsyncMock

import pytest

from app.shared.config import settings
from app.song_processing.lyrics_conversion import LyricsConversionService
from app.song_processing.models import LyricsResult
from app.song_processing.service import SongProcessingService


def test_converts_plain_romaji_line_to_hiragana():
    service = LyricsConversionService()
    result = service.convert_romaji_lines_to_kana(["sayonara mata itsuka aou"])

    assert result.converted is True
    assert result.lines == ["さよならまたいつかあおう"]


def test_handles_macron_long_vowels_without_corruption():
    service = LyricsConversionService()
    result = service.convert_romaji_lines_to_kana(["tōkyō"])

    assert result.converted is True
    # Macron should have expanded to doubled vowels before kana conversion,
    # not passed through untouched and corrupted the surrounding syllables.
    assert "ō" not in result.lines[0]
    assert result.lines[0] == "とうきょう"


def test_preserves_blank_lines_verbatim():
    service = LyricsConversionService()
    result = service.convert_romaji_lines_to_kana(["sayonara", "", "  ", "mata ne"])

    assert result.lines[1] == ""
    assert result.lines[2] == "  "


def test_keeps_line_count_identical_to_input():
    service = LyricsConversionService()
    lines = ["sayonara", "mata itsuka", "aou ne"]
    result = service.convert_romaji_lines_to_kana(lines)

    assert len(result.lines) == len(lines)


def test_fails_soft_and_keeps_original_on_degenerate_output(monkeypatch):
    import app.song_processing.lyrics_conversion as module

    # Simulate a conversion that produces no usable kana (e.g. an unexpected
    # library failure mode) — original line must survive untouched.
    monkeypatch.setattr(module, "_convert_line", lambda line: "")

    service = LyricsConversionService()
    result = service.convert_romaji_lines_to_kana(["sayonara"])

    assert result.lines == ["sayonara"]
    assert result.converted is False


def test_fails_soft_on_exception_during_conversion(monkeypatch):
    import app.song_processing.lyrics_conversion as module

    def _raise(line):
        raise ValueError("boom")

    monkeypatch.setattr(module, "_convert_line", _raise)

    service = LyricsConversionService()
    result = service.convert_romaji_lines_to_kana(["sayonara"])

    assert result.lines == ["sayonara"]
    assert result.converted is False


def test_returns_not_converted_when_all_lines_already_non_romaji():
    service = LyricsConversionService()
    # Already-kana input isn't romaji, but alphabet2kana should pass it through
    # unchanged rather than mangling it; either way this must not crash.
    result = service.convert_romaji_lines_to_kana(["さよなら"])

    assert isinstance(result.lines, list)
    assert len(result.lines) == 1


# --- Gating inside SongProcessingService.fetch_lyrics_only ---


@pytest.fixture(autouse=True)
def _restore_flag():
    original = settings.ENABLE_ROMAJI_CONVERSION
    yield
    settings.ENABLE_ROMAJI_CONVERSION = original


def _service_with_mocked_fetch(lines, format_, monkeypatch):
    service = SongProcessingService()
    monkeypatch.setattr(
        service.lyrics,
        "fetch_lyrics",
        AsyncMock(return_value=LyricsResult(lines=lines, format=format_, confidence=0.9, source="musixmatch")),
    )
    return service


async def test_romaji_and_japanese_origin_triggers_conversion(monkeypatch):
    settings.ENABLE_ROMAJI_CONVERSION = True
    service = _service_with_mocked_fetch(["sayonara"], "romaji", monkeypatch)

    response = await service.fetch_lyrics_only(title="t", artist="a", youtube_id="y", origin_language="ja")

    assert response.converted_from_romaji is True
    assert response.format == "japanese"
    assert response.lines == ["さよなら"]


async def test_japanese_format_is_never_converted(monkeypatch):
    settings.ENABLE_ROMAJI_CONVERSION = True
    service = _service_with_mocked_fetch(["さよなら"], "japanese", monkeypatch)

    response = await service.fetch_lyrics_only(title="t", artist="a", youtube_id="y", origin_language="ja")

    assert response.converted_from_romaji is False
    assert response.lines == ["さよなら"]


async def test_unknown_format_is_never_converted(monkeypatch):
    settings.ENABLE_ROMAJI_CONVERSION = True
    service = _service_with_mocked_fetch(["??"], "unknown", monkeypatch)

    response = await service.fetch_lyrics_only(title="t", artist="a", youtube_id="y", origin_language="ja")

    assert response.converted_from_romaji is False


async def test_flag_disabled_skips_conversion_regardless_of_format(monkeypatch):
    settings.ENABLE_ROMAJI_CONVERSION = False
    service = _service_with_mocked_fetch(["sayonara"], "romaji", monkeypatch)

    response = await service.fetch_lyrics_only(title="t", artist="a", youtube_id="y", origin_language="ja")

    assert response.converted_from_romaji is False
    assert response.lines == ["sayonara"]


async def test_non_japanese_origin_skips_conversion(monkeypatch):
    settings.ENABLE_ROMAJI_CONVERSION = True
    service = _service_with_mocked_fetch(["sayonara"], "romaji", monkeypatch)

    response = await service.fetch_lyrics_only(title="t", artist="a", youtube_id="y", origin_language="en")

    assert response.converted_from_romaji is False
    assert response.lines == ["sayonara"]
