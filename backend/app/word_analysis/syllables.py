"""
Syllable breakdown for pronunciation learning
Breaks hiragana/katakana into individual characters with romaji
"""
from typing import List
from app.word_analysis.models import Syllable
import pykakasi


# Initialize pykakasi converter
_kks = pykakasi.kakasi()


def generate_syllables(text: str, script_type: str) -> List[Syllable]:
    """
    Generate syllable breakdown for hiragana or katakana text

    Args:
        text: Hiragana or katakana text
        script_type: 'hiragana' or 'katakana'

    Returns:
        List of Syllable objects with character + romaji

    Example:
        generate_syllables("さえ", "hiragana")
        → [Syllable(text="さ", romaji="sa"), Syllable(text="え", romaji="e")]
    """
    if script_type not in ['hiragana', 'katakana']:
        return []

    syllables = []

    # Process each character
    for char in text:
        # Convert character to romaji
        result = _kks.convert(char)
        if result:
            romaji = result[0]['hepburn']
            syllables.append(Syllable(text=char, romaji=romaji))

    return syllables


def hiragana_to_romaji(text: str) -> str:
    """Convert hiragana text to romaji"""
    result = _kks.convert(text)
    return ''.join(item['hepburn'] for item in result)


def katakana_to_romaji(text: str) -> str:
    """Convert katakana text to romaji"""
    result = _kks.convert(text)
    return ''.join(item['hepburn'] for item in result)
