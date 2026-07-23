"""
Language-specific tokenizers
Japanese tokenizer using fugashi + UniDic
"""

from typing import List

import fugashi
import pykakasi

from app.word_analysis.models import TokenInfo


class JapaneseTokenizer:
    """Japanese tokenizer using fugashi (MeCab wrapper) with UniDic"""

    def __init__(self):
        # Initialize fugashi tagger with UniDic dictionary
        self.tagger = fugashi.Tagger()

        # Initialize pykakasi for katakana → hiragana and → romaji conversion
        self.kks = pykakasi.kakasi()

    def tokenize(self, text: str) -> List[TokenInfo]:
        """
        Tokenize Japanese text into words

        Args:
            text: Japanese text to tokenize

        Returns:
            List of TokenInfo objects
        """
        tokens = []
        words = self.tagger(text)

        for word in words:
            # Get reading in katakana from UniDic
            reading_katakana = word.feature.kana if hasattr(word.feature, "kana") else None

            # Convert katakana to hiragana for the reading field
            reading_hiragana = None
            if reading_katakana:
                reading_hiragana = self._katakana_to_hiragana(reading_katakana)

            token = TokenInfo(
                surface=word.surface,  # Text as it appears
                pos=word.feature.pos1,  # Part of speech
                lemma=getattr(word.feature, "lemma", None) or word.surface,
                reading=reading_hiragana,  # Hiragana reading
            )
            tokens.append(token)

        return tokens

    def get_full_reading(self, tokens: List[TokenInfo]) -> str:
        """Get full hiragana reading for a list of tokens"""
        readings = []
        for token in tokens:
            if token.reading:
                readings.append(token.reading)
            else:
                # For words without reading (e.g., English), use surface form
                readings.append(token.surface)
        return "".join(readings)

    def get_full_romaji(self, tokens: List[TokenInfo]) -> str:
        """Get full romaji transliteration for a list of tokens"""
        full_text = "".join(token.surface for token in tokens)
        return self.to_romaji(full_text)

    def to_romaji(self, text: str) -> str:
        """Convert Japanese text to romaji"""
        result = self.kks.convert(text)
        romaji_parts = [item["hepburn"] for item in result]
        return " ".join(romaji_parts)

    def _katakana_to_hiragana(self, katakana: str) -> str:
        """Convert katakana to hiragana"""
        result = self.kks.convert(katakana)
        hiragana_parts = [item["hira"] for item in result]
        return "".join(hiragana_parts)


# Future tokenizers for Phase 3


class ChineseTokenizer:
    """Chinese tokenizer using jieba (Phase 3)"""

    pass


class KoreanTokenizer:
    """Korean tokenizer using KoNLPy (Phase 3)"""

    pass


class RussianTokenizer:
    """Russian tokenizer using pymorphy2 (Phase 3)"""

    pass
