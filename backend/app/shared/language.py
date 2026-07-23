"""
Language detection utilities
Detects language from text using langdetect
"""
from langdetect import detect, LangDetectException


def detect_language(text: str) -> str:
    """
    Detect language code from text

    Args:
        text: Text to analyze

    Returns:
        ISO 639-1 language code (e.g., 'ja', 'zh', 'ko', 'ru', 'es')
    """
    try:
        # langdetect returns ISO 639-1 codes
        lang_code = detect(text)
        return lang_code
    except LangDetectException:
        # Default to Japanese if detection fails
        return "ja"


def get_language_name(code: str) -> str:
    """Get full language name from code"""
    language_names = {
        "ja": "Japanese",
        "zh": "Chinese",
        "ko": "Korean",
        "ru": "Russian",
        "es": "Spanish",
        "en": "English"
    }
    return language_names.get(code, "Unknown")
