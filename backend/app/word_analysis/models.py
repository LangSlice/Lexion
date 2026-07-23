"""
Word analysis models
Internal models for word processing (before converting to API models)
"""

from typing import List, Optional

from pydantic import BaseModel


class TokenInfo(BaseModel):
    """Information from tokenizer"""

    surface: str  # Text as it appears
    pos: str  # Part of speech
    lemma: str  # Dictionary form
    reading: Optional[str] = None  # Katakana/hiragana reading


class Syllable(BaseModel):
    """Single syllable for pronunciation"""

    text: str
    romaji: str


class KanjiCandidate(BaseModel):
    """One ranked JMdict kanji spelling for a kana word's reading"""

    text: str
    meanings: List[str]


class WordInfo(BaseModel):
    """Complete word information from analysis"""

    text: str
    script_type: str
    reading: Optional[str] = None
    transliteration: str
    meanings: List[str]
    context: Optional[str] = None
    explanation: Optional[str] = None
    position: int
    is_compound: bool = False
    sub_words: Optional[List["WordInfo"]] = None
    syllables: Optional[List[Syllable]] = None
    group_id: Optional[str] = None  # never populated by analysis; parity with the API-facing WordBreakdown model
    start_time_ms: Optional[int] = None  # never populated by analysis; frontend attaches these post-/analyze
    end_time_ms: Optional[int] = None
    # Only populated when this word arrived as kana and JMdict had at least one kanji
    # spelling for its reading — `text` above already reflects the top-ranked candidate.
    kanji_candidates: Optional[List[KanjiCandidate]] = None
