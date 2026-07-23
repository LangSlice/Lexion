"""
Word analysis service - main orchestrator
Coordinates tokenization, dictionary lookup, and syllable generation
"""

from typing import Dict, List

from app.word_analysis.dictionary import JapaneseDictionary
from app.word_analysis.models import WordInfo
from app.word_analysis.syllables import generate_syllables
from app.word_analysis.tokenizer import JapaneseTokenizer


class WordAnalysisService:
    """Main service for analyzing words in lyrics"""

    def __init__(self):
        # Initialize language-specific analyzers
        self.ja_tokenizer = JapaneseTokenizer()
        self.ja_dictionary = JapaneseDictionary()

    async def analyze_timed_lyrics(
        self, timed_lines: List[Dict], language: str, target_language: str
    ) -> List[Dict]:
        """
        Analyze lyric lines that already carry real timestamps (e.g. from
        client-side Whisper transcription), instead of generating them.

        Args:
            timed_lines: List of {start_time_ms, end_time_ms, text} dicts, in order
            language: Source language code ('ja', 'zh', 'ko', 'ru')
            target_language: Target language for translations ('es', 'en')

        Returns:
            List of fully analyzed LyricLine dicts (id, timestamps, text, breakdown),
            with the caller-supplied timestamps preserved verbatim.
        """
        analyzed_lines = []
        line_id = 1

        for timed_line in timed_lines:
            line_text = timed_line["text"]
            if not line_text.strip():
                continue

            if language == "ja":
                [line_text] = self._preprocess_japanese_lyrics([line_text]) or [line_text]
                line_data = await self._analyze_japanese_line(line_text, line_id - 1, target_language)
            else:
                line_data = self._create_simple_line(line_text, line_id - 1)

            line_data["id"] = line_id
            line_data["start_time_ms"] = timed_line["start_time_ms"]
            line_data["end_time_ms"] = timed_line["end_time_ms"]
            analyzed_lines.append(line_data)
            line_id += 1

        return analyzed_lines

    async def analyze_lyrics(
        self, lyrics_text: List[str], language: str, target_language: str
    ) -> List[Dict]:
        """
        Analyze lyrics lines and generate word breakdowns

        Args:
            lyrics_text: List of lyric lines (strings)
            language: Source language code ('ja', 'zh', 'ko', 'ru')
            target_language: Target language for translations ('es', 'en')

        Returns:
            List of analyzed lines with word breakdowns
        """
        analyzed_lines = []

        # Preprocess Japanese lyrics to handle edge cases
        if language == "ja":
            lyrics_text = self._preprocess_japanese_lyrics(lyrics_text)

        for line_num, line_text in enumerate(lyrics_text):
            # Skip empty lines
            if not line_text.strip():
                continue

            # Analyze based on language
            if language == "ja":
                line_data = await self._analyze_japanese_line(line_text, line_num, target_language)
            # TODO: Add support for other languages in Phase 3
            else:
                # Fallback: treat as single word
                line_data = self._create_simple_line(line_text, line_num)

            analyzed_lines.append(line_data)

        return analyzed_lines

    async def _analyze_japanese_line(
        self, line_text: str, line_num: int, target_language: str
    ) -> Dict:
        """Analyze a Japanese lyric line"""
        # Step 1: Tokenize
        tokens = self.ja_tokenizer.tokenize(line_text)

        # Step 2: Dictionary lookup for each token
        words_info: List[WordInfo] = []
        for pos, token in enumerate(tokens):
            word_info = await self.ja_dictionary.lookup(
                word=token.surface, reading=token.reading, target_language=target_language
            )
            word_info.position = pos

            # Step 3: Generate syllables for hiragana/katakana
            if word_info.script_type in ["hiragana", "katakana"]:
                word_info.syllables = generate_syllables(word_info.text, word_info.script_type)

            # Step 4: For kanji compounds, break into radicals
            if word_info.script_type == "kanji" and len(word_info.text) > 1:
                word_info.is_compound = True
                word_info.sub_words = await self._break_compound(word_info.text, target_language)

            words_info.append(word_info)

        # Step 5: Assemble line data
        return {
            "text": {
                "original": line_text,
                "reading": self.ja_tokenizer.get_full_reading(tokens),
                "transliteration": self.ja_tokenizer.get_full_romaji(tokens),
                "translation": "",  # TODO: Add AI translation in Phase 4
                "explanation": "",
            },
            "breakdown": [word.dict() for word in words_info],
        }

    async def _break_compound(self, kanji_word: str, target_language: str) -> List[WordInfo]:
        """Break kanji compound into individual characters"""
        sub_words = []
        for i, char in enumerate(kanji_word):
            char_info = await self.ja_dictionary.lookup(
                word=char, reading=None, target_language=target_language
            )
            char_info.position = i
            sub_words.append(char_info)
        return sub_words

    def _create_simple_line(self, line_text: str, line_num: int) -> Dict:
        """Create a simple line structure (fallback for unsupported languages)"""
        return {
            "text": {
                "original": line_text,
                "reading": "",
                "transliteration": "",
                "translation": "",
                "explanation": "",
            },
            "breakdown": [],
        }

    def _preprocess_japanese_lyrics(self, lyrics_text: List[str]) -> List[str]:
        """
        Additional Japanese-specific preprocessing
        - Remove remaining symbols
        - Normalize whitespace
        - Handle mixed scripts
        """
        import re

        cleaned = []

        for line in lyrics_text:
            # Remove parentheses with single characters (formatting artifacts)
            line = re.sub(r'\(\s*[*・]\s*\)', '', line)
            line = re.sub(r'\[\s*[*・]\s*\]', '', line)

            # Normalize multiple spaces to single space
            line = re.sub(r'\s+', ' ', line)

            # Strip and skip if empty
            line = line.strip()
            if not line:
                continue

            cleaned.append(line)

        return cleaned
