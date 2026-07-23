"""
Lyrics fetching service
Integrates with Musixmatch's official API.

Note: an earlier version of this file also integrated Genius via the
`lyricsgenius` library, which fetches lyrics by scraping Genius.com pages —
Genius doesn't expose lyrics through a public API at all. That scraping
approach violates Genius's terms of service regardless of who runs it or
whether the code is open-source, so it's been removed entirely rather than
just feature-flagged. Musixmatch has a real API with an official approval
process for lyrics access, so it remains here (gated by
ENABLE_LICENSED_LYRICS_PROVIDERS) for operators who've secured that.
"""
import logging
from typing import Optional, List, Tuple
from app.shared.config import settings
from app.song_processing.models import LyricsResult
from app.song_processing.title_cleaning import clean_title_artist

logger = logging.getLogger(__name__)


def detect_lyric_format(text: str) -> Tuple[str, float]:
    """
    Detect lyrics format with confidence score

    Args:
        text: Lyrics text to analyze

    Returns:
        Tuple of (format, confidence) where:
        - format: 'romaji' | 'japanese' | 'mixed' | 'unknown'
        - confidence: 0.0-1.0 confidence score
    """
    if not text or len(text.strip()) < 10:
        return ('unknown', 0.0)

    # Count character types
    total_chars = len([c for c in text if not c.isspace()])
    if total_chars == 0:
        return ('unknown', 0.0)

    kanji_count = sum(1 for c in text if 0x4E00 <= ord(c) <= 0x9FFF)
    hiragana_count = sum(1 for c in text if 0x3040 <= ord(c) <= 0x309F)
    katakana_count = sum(1 for c in text if 0x30A0 <= ord(c) <= 0x30FF)
    latin_alpha_count = sum(1 for c in text if c.isascii() and c.isalpha())

    japanese_chars = kanji_count + hiragana_count + katakana_count
    japanese_ratio = japanese_chars / total_chars
    latin_ratio = latin_alpha_count / total_chars

    # Classification thresholds
    JAPANESE_THRESHOLD = 0.50  # 50% Japanese chars = Japanese
    MIXED_THRESHOLD = 0.15     # 15%+ of both = mixed
    ROMAJI_THRESHOLD = 0.60    # 60%+ Latin = romaji

    # Determine format and confidence
    if japanese_ratio >= JAPANESE_THRESHOLD and latin_ratio < MIXED_THRESHOLD:
        return ('japanese', min(japanese_ratio / JAPANESE_THRESHOLD, 1.0))
    elif latin_ratio >= ROMAJI_THRESHOLD and japanese_ratio < MIXED_THRESHOLD:
        return ('romaji', min(latin_ratio / ROMAJI_THRESHOLD, 1.0))
    elif japanese_ratio >= MIXED_THRESHOLD and latin_ratio >= MIXED_THRESHOLD:
        confidence = min(japanese_ratio + latin_ratio, 1.0) * 0.8
        return ('mixed', confidence)
    else:
        return ('unknown', 0.3)


def detect_vertical_format_pattern(line1: str, line2: str, line3: str) -> bool:
    """
    Check if 3 consecutive lines represent vertical format:
    - line1: hiragana/katakana reading
    - line2: kanji characters
    - line3: romaji transliteration

    Example:
    はめつ     (hiragana)
    破滅       (kanji)
    hametsu   (romaji)
    """
    if not (line1 and line2 and line3):
        return False

    # Check character types
    has_hiragana = any(0x3040 <= ord(c) <= 0x309F for c in line1)
    has_katakana = any(0x30A0 <= ord(c) <= 0x30FF for c in line1)
    has_kanji = any(0x4E00 <= ord(c) <= 0x9FFF for c in line2)
    has_latin = any(c.isascii() and c.isalpha() for c in line3)

    # Vertical format: line1 has kana, line2 has kanji, line3 has latin
    is_vertical = (has_hiragana or has_katakana) and has_kanji and has_latin

    # Additional check: similar lengths (same word in different scripts)
    length_check = abs(len(line1) - len(line3)) <= 3

    return is_vertical and length_check


def merge_vertical_format_lyrics(lines: List[str]) -> List[str]:
    """
    Merge Japanese vertical format lyrics into horizontal sentences

    Some sources store lyrics vertically split by script, e.g.:
    はめつ
    破滅
    hametsu

    We merge to:
    破滅 (keeping kanji as primary)
    """
    merged = []
    i = 0

    while i < len(lines):
        # Check if next 3 lines form vertical pattern
        if i + 2 < len(lines):
            line1, line2, line3 = lines[i], lines[i+1], lines[i+2]

            if detect_vertical_format_pattern(line1, line2, line3):
                # Use kanji line as primary text
                merged.append(line2)
                i += 3  # Skip all 3 lines
                continue

        # Not a pattern, keep current line as-is
        merged.append(lines[i])
        i += 1

    return merged


def filter_decorative_symbols(lines: List[str]) -> List[str]:
    """Remove lines that are only decorative symbols or whitespace"""
    DECORATIVE_SYMBOLS = {'*', '・', '～', '〜', '　', '※', '♪', '♡'}

    filtered = []
    for line in lines:
        # Skip if line is only symbols/whitespace
        if all(c in DECORATIVE_SYMBOLS or c.isspace() for c in line):
            continue

        # Skip very short lines (likely fragments)
        if len(line.strip()) < 2:
            continue

        filtered.append(line)

    return filtered


class LyricsService:
    """Service for fetching song lyrics via Musixmatch's official API"""

    async def fetch_lyrics(self, title: str, artist: str, youtube_id: str = "") -> LyricsResult:
        """
        Fetch lyrics from Musixmatch.

        Args:
            title: Song title
            artist: Artist name
            youtube_id: YouTube video ID (reserved for future use)

        Returns:
            LyricsResult with lyrics and metadata

        Raises:
            LyricsNotFoundException: If no source found lyrics
        """
        # Defense-in-depth: clean the title/artist here regardless of what the caller
        # sent — callers (the YouTube search endpoint, a direct API call, etc.) may
        # not have cleaned a raw video title at all, and this is the last point before
        # it turns into a Musixmatch query.
        cleaned_title, cleaned_artist = clean_title_artist(title, artist)
        if (cleaned_title, cleaned_artist) != (title, artist):
            logger.info(f"Cleaned lyrics search query: '{title}' by '{artist}' -> '{cleaned_title}' by '{cleaned_artist}'")

        sources_tried = []

        if settings.MUSIXMATCH_API_KEY:
            result = await self._fetch_from_musixmatch(cleaned_title, cleaned_artist)
            if result:
                logger.info("Successfully fetched lyrics from Musixmatch")
                return result
            sources_tried.append("musixmatch")

        # All sources failed
        sources_str = ", ".join(sources_tried) if sources_tried else "no sources configured"
        error_msg = f"Could not find lyrics for '{cleaned_title}' by {cleaned_artist} (tried: {sources_str})"
        logger.error(error_msg)
        raise LyricsNotFoundException(error_msg, sources_tried=sources_tried)

    async def _fetch_from_musixmatch(self, title: str, artist: str) -> Optional[LyricsResult]:
        """Fetch lyrics from Musixmatch API"""
        if not settings.MUSIXMATCH_API_KEY:
            logger.warning("Musixmatch API not configured")
            return None

        import httpx
        base_url = "https://api.musixmatch.com/ws/1.1"

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Step 1: Search for track
                logger.info(f"Searching Musixmatch for: '{title}' by '{artist}'")

                search_resp = await client.get(
                    f"{base_url}/track.search",
                    params={
                        "q_track": title,
                        "q_artist": artist,
                        "page_size": 5,
                        "apikey": settings.MUSIXMATCH_API_KEY
                    }
                )
                search_data = search_resp.json()

                if search_data.get("message", {}).get("header", {}).get("status_code") != 200:
                    logger.warning(f"Musixmatch search failed: {search_data}")
                    return None

                track_list = search_data.get("message", {}).get("body", {}).get("track_list", [])
                if not track_list:
                    logger.info("No tracks found on Musixmatch")
                    return None

                # Get first match
                track = track_list[0]["track"]
                track_id = track["track_id"]
                found_title = track["track_name"]
                found_artist = track["artist_name"]

                logger.info(f"Found on Musixmatch: '{found_title}' by '{found_artist}' (ID: {track_id})")

                # Step 2: Get lyrics
                lyrics_resp = await client.get(
                    f"{base_url}/track.lyrics.get",
                    params={"track_id": track_id, "apikey": settings.MUSIXMATCH_API_KEY}
                )
                lyrics_data = lyrics_resp.json()

                if lyrics_data.get("message", {}).get("header", {}).get("status_code") != 200:
                    logger.warning(f"Musixmatch lyrics fetch failed: {lyrics_data}")
                    return None

                lyrics_body = lyrics_data.get("message", {}).get("body", {}).get("lyrics", {})
                lyrics_text = lyrics_body.get("lyrics_body", "")

                if not lyrics_text or lyrics_text.strip() == "":
                    logger.warning("Musixmatch returned empty lyrics")
                    return None

                # Clean Musixmatch footer
                if "*******" in lyrics_text:
                    lyrics_text = lyrics_text.split("*******")[0].strip()

                # Parse into lines
                lines = [line.strip() for line in lyrics_text.split('\n') if line.strip()]

                if len(lines) < 10:
                    logger.warning(f"Musixmatch lyrics too short ({len(lines)} lines)")
                    return None

                # Detect format
                detected_format, confidence = detect_lyric_format(lyrics_text)

                logger.info(
                    f"Musixmatch lyrics retrieved: {len(lines)} lines, "
                    f"format={detected_format}, confidence={confidence:.2f}"
                )

                return LyricsResult(
                    lines=lines,
                    format=detected_format,
                    confidence=confidence,
                    source='musixmatch',
                    metadata={
                        'musixmatch_track_id': track_id,
                        'musixmatch_title': found_title,
                        'musixmatch_artist': found_artist
                    }
                )

        except httpx.TimeoutException:
            logger.error("Musixmatch API timeout")
            return None
        except httpx.HTTPError as e:
            logger.error(f"Musixmatch HTTP error: {e}")
            return None
        except Exception as e:
            logger.error(f"Musixmatch unexpected error: {e}", exc_info=True)
            return None

    def parse_lyrics_to_lines(self, lyrics_text: str) -> List[str]:
        """Parse raw lyrics text into clean lines"""
        lines = []
        for line in lyrics_text.split('\n'):
            line = line.strip()
            # Skip empty lines and section headers
            if line and not (line.startswith('[') and line.endswith(']')):
                lines.append(line)
        return lines


class LyricsNotFoundException(Exception):
    """Exception raised when lyrics cannot be found from any source"""
    def __init__(self, message: str, sources_tried: List[str] = None):
        super().__init__(message)
        self.sources_tried = sources_tried or []
