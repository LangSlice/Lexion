"""
Deterministic romaji -> kana conversion for lyrics that were fetched in
romanized form but are needed in native Japanese script for study/alignment.

Not a kana -> kanji ("IME") engine: UniDic's orthBase mirrors whatever script
a token's surface already uses (kana in, kana out), so real kanji conversion
would require conjugation-aware re-inflection and homophone disambiguation —
out of scope here. Kana is genuine, learnable Japanese script, so romaji->kana
is the full extent of this conversion.
"""

import logging
from dataclasses import dataclass
from typing import List

import jaconv

logger = logging.getLogger(__name__)

# jaconv.alphabet2kana has no notion of macrons, so long vowels written with a
# macron (common in Hepburn romanization, e.g. "sutēji") must be expanded to
# their doubled-vowel equivalent first, or they pass through untouched and
# corrupt the surrounding conversion.
_MACRON_TO_HEPBURN = str.maketrans({
    "ā": "aa", "ī": "ii", "ū": "uu", "ē": "ee", "ō": "ou",
    "Ā": "AA", "Ī": "II", "Ū": "UU", "Ē": "EE", "Ō": "OU",
})


@dataclass
class ConversionResult:
    lines: List[str]
    converted: bool


def _normalize_macrons(text: str) -> str:
    return text.translate(_MACRON_TO_HEPBURN)


def _convert_line(line: str) -> str:
    """
    Best-effort romaji->kana for one line; raises on unexpected failure.

    jaconv.alphabet2kana preserves the spaces between romaji words, but written
    Japanese never uses inter-word spaces — collapsing them is always correct,
    not a lossy heuristic.
    """
    kana = jaconv.alphabet2kana(_normalize_macrons(line))
    return "".join(kana.split(" "))


def _looks_degenerate(original: str, converted: str) -> bool:
    """True if conversion produced nothing useful (e.g. still mostly Latin)."""
    if original.strip() and not converted.strip():
        return True
    latin_chars = sum(1 for c in converted if c.isascii() and c.isalpha())
    return latin_chars > len(converted) * 0.5


class LyricsConversionService:
    """Converts romaji lyric lines to hiragana, line-by-line, fail-soft."""

    def convert_romaji_lines_to_kana(self, lines: List[str]) -> ConversionResult:
        converted_lines: List[str] = []
        any_converted = False

        for line in lines:
            if not line.strip():
                converted_lines.append(line)
                continue

            try:
                candidate = _convert_line(line)
            except Exception as e:
                logger.warning(f"Romaji->kana conversion failed for line {line!r}: {e}")
                converted_lines.append(line)
                continue

            if _looks_degenerate(line, candidate):
                logger.warning(f"Romaji->kana conversion looked degenerate for line {line!r}, keeping original")
                converted_lines.append(line)
                continue

            converted_lines.append(candidate)
            any_converted = True

        return ConversionResult(lines=converted_lines, converted=any_converted)
