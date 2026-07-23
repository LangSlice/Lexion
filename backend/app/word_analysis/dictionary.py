"""
Dictionary lookup services
JMDict for Japanese, CC-CEDICT for Chinese, etc.
"""

from typing import List, Optional

from jamdict import Jamdict

from app.word_analysis.models import KanjiCandidate, WordInfo
from app.word_analysis.syllables import generate_syllables
from app.word_analysis.tokenizer import JapaneseTokenizer

class LanguageCode:
    ES = "es"
    EN = "en"

# JMdict priority tags, most-common-first — used to rank candidate kanji spellings
# sharing the same reading (e.g. はし: 橋/箸/端) so the most plausible one is the default.
KANJI_CANDIDATE_PRIORITY_ORDER = ["spec1", "ichi1", "news1", "gai1", "spec2", "ichi2", "news2", "gai2"]
MAX_KANJI_CANDIDATES = 5


def _priority_rank(pri: List[str]) -> int:
    for i, tag in enumerate(KANJI_CANDIDATE_PRIORITY_ORDER):
        if tag in pri:
            return i
    return len(KANJI_CANDIDATE_PRIORITY_ORDER)


class JapaneseDictionary:
    """Japanese dictionary using JMDict"""

    def __init__(self):
        # Initialize JMDict
        self.jmd = Jamdict()
        self.tokenizer = JapaneseTokenizer()

        # Language code mapping for JMDict glosses
        self.lang_codes = {
            LanguageCode.EN: "eng",  # English
            LanguageCode.ES: "spa",  # Spanish
        }

    def _extract_meanings(self, entry, target_lang_code: str) -> List[str]:
        """Glosses in target_lang_code, falling back to whatever's available (English default)."""
        meanings = []
        for sense in entry.senses:
            for gloss in sense.gloss:
                # Check if gloss has the target language
                if hasattr(gloss, "lang") and gloss.lang == target_lang_code:
                    meanings.append(gloss.text)
                elif not hasattr(gloss, "lang"):
                    # Default English glosses (no lang attribute)
                    if target_lang_code == "eng":
                        meanings.append(gloss.text)

        # If no target language meanings found, use whatever's available as fallback
        if not meanings:
            for sense in entry.senses:
                for gloss in sense.gloss:
                    meanings.append(gloss.text)
                    if len(meanings) >= 3:  # Limit to 3 meanings
                        break
                if len(meanings) >= 3:
                    break

        return meanings[:3]

    def _kanji_candidates_for_reading(self, reading: str, target_lang_code: str) -> List[KanjiCandidate]:
        """
        Ranked kanji spellings sharing `reading` (e.g. はし -> 橋/箸/端), most-common-first.
        JMdict indexes dictionary/lemma readings only, not inflected surface forms — a
        conjugated verb/adjective reading legitimately returns no candidates here, which
        is intentional (see lyrics_conversion.py's docstring for why re-inflection is
        out of scope): the word simply stays as kana rather than risk a wrong guess.
        """
        result = self.jmd.lookup(reading)

        seen_texts = set()
        ranked: List[tuple] = []
        for entry in result.entries:
            for kanji_form in entry.kanji_forms or []:
                if kanji_form.text in seen_texts:
                    continue
                seen_texts.add(kanji_form.text)
                ranked.append((_priority_rank(kanji_form.pri), kanji_form.text, entry))

        ranked.sort(key=lambda candidate: candidate[0])

        return [
            KanjiCandidate(text=text, meanings=self._extract_meanings(entry, target_lang_code))
            for _, text, entry in ranked[:MAX_KANJI_CANDIDATES]
        ]

    async def lookup(self, word: str, reading: Optional[str], target_language: str) -> WordInfo:
        """
        Lookup word in JMDict

        Args:
            word: Japanese word (kanji/hiragana/katakana)
            reading: Optional hiragana reading from tokenizer
            target_language: Target language code ('es', 'en')

        Returns:
            WordInfo with meanings, readings, transliterations
        """
        script_type = self._detect_script_type(word)
        target_lang_code = self.lang_codes.get(target_language, "eng")

        # Kana word with a known reading: try to auto-apply the most common kanji spelling
        # for that reading, but keep every candidate so the frontend can offer an override
        # (including reverting to plain kana) — MeCab's word segmentation on kana-only text
        # is unreliable, so this pick is a convenience default, never a silent final answer.
        if script_type in ("hiragana", "katakana") and reading:
            candidates = self._kanji_candidates_for_reading(reading, target_lang_code)
            if candidates:
                best = candidates[0]
                return WordInfo(
                    text=best.text,
                    script_type="kanji",
                    reading=reading,
                    transliteration=self.tokenizer.to_romaji(reading),
                    meanings=best.meanings,
                    position=0,  # Will be set by caller
                    kanji_candidates=candidates,
                )
            # No JMdict kanji candidates for this reading (loanword, function word, or an
            # inflected surface JMdict doesn't index) — fall through to the plain-kana lookup below.

        # Lookup in dictionary
        result = self.jmd.lookup(word)

        # Extract information
        meanings = []
        dict_reading = reading  # Use tokenizer reading as default

        if result.entries:
            entry = result.entries[0]  # Use first entry

            # Get reading from dictionary if not provided
            if not dict_reading and entry.kana_forms:
                dict_reading = entry.kana_forms[0].text

            meanings = self._extract_meanings(entry, target_lang_code)

        # If no dictionary entry found, use word itself
        if not meanings:
            meanings = [word]

        # Generate transliteration (romaji)
        transliteration = self.tokenizer.to_romaji(dict_reading or word)

        return WordInfo(
            text=word,
            script_type=script_type,
            reading=dict_reading if script_type == "kanji" else None,
            transliteration=transliteration,
            meanings=meanings[:3],  # Limit to 3 meanings
            position=0,  # Will be set by caller
        )

    def _detect_script_type(self, text: str) -> str:
        """Detect script type of Japanese text"""
        if not text:
            return "unknown"

        first_char = text[0]
        code = ord(first_char)

        # Unicode ranges
        if 0x4E00 <= code <= 0x9FFF:  # CJK Unified Ideographs (Kanji)
            return "kanji"
        elif 0x3040 <= code <= 0x309F:  # Hiragana
            return "hiragana"
        elif 0x30A0 <= code <= 0x30FF:  # Katakana
            return "katakana"
        elif (0x0041 <= code <= 0x005A) or (0x0061 <= code <= 0x007A):  # ASCII letters
            return "english"
        else:
            return "unknown"


# Future dictionaries for Phase 3


class ChineseDictionary:
    """Chinese dictionary using CC-CEDICT (Phase 3)"""

    pass


class KoreanDictionary:
    """Korean dictionary (Phase 3)"""

    pass


class RussianDictionary:
    """Russian dictionary using StarDict (Phase 3)"""

    pass
