"""
Title/artist cleaning heuristics for YouTube video metadata.

YouTube video titles for music videos follow no single convention — this module
handles the patterns actually seen in practice: delimiter-split ("Artist - Title"),
Japanese quote-bracket titles ("Artist「Title」Official MV (anime OP note)"), and
noise words/phrases layered on top (Official Video, Lyrics, Full Version, bracketed
tags like [Kan/Rom/Eng]). This is a best-effort cleanup so a downstream lyrics
search (Musixmatch) has a fighting chance — not a guarantee, and the artist
hint it's given (often a channel/uploader name, not the real performing artist) is
overridden whenever the title itself contains a stronger signal.
"""
import re
from typing import Optional, Tuple

# Phrases that show up as decoration in music-video titles, never part of a real
# song title — stripped case-insensitively, anywhere in the string. Longer/more
# specific phrases are listed before their substrings so they consume the whole
# phrase (e.g. "official music video" before the bare "official").
_JUNK_PHRASES = [
    r'official\s+music\s+video',
    r'official\s+lyric\s+video',
    r'official\s+video',
    r'official\s+audio',
    r'lyric\s+video',
    r'lyrics\s+video',
    r'music\s+video',
    r'full\s+version',
    r'full\s+ver\.?',
    r'\bmv\b',
    r'\blyrics\b',
    r'\bofficial\b',
    r'\bhd\b',
    r'\b4k\b',
    r'kan[/_ ]?rom[/_ ]?eng',
    r'romaji[/_ ]?kanji[/_ ]?english',
    r'vietsub',
    r'eng\s*sub',
]
_JUNK_PATTERN = re.compile('|'.join(_JUNK_PHRASES), re.IGNORECASE)

# Channel-name suffixes YouTube (or uploaders) commonly append — these describe the
# channel, not the artist.
_ARTIST_SUFFIXES = [
    r'\s*Official\s*Channel\s*$',
    r'\s*-\s*Topic\s*$',
    r'\s*VEVO\s*$',
    r'\s*Official\s*$',
    r'\s*Music\s*$',
]
_ARTIST_SUFFIX_PATTERN = re.compile('|'.join(_ARTIST_SUFFIXES), re.IGNORECASE)

# Delimiters separating "Artist" from "Title" in a flat (non-bracketed) title,
# tried in order.
_ARTIST_TITLE_DELIMITERS = [' - ', ' / ', '／', ' | ', ': ']

# Bracket pairs used to directly quote a song title in Japanese MV titles, tried in
# order — 「」 almost always wraps the song title itself, 『』 more often wraps an
# enclosing work's title (an anime, film, album), so it's the weaker second guess.
_TITLE_BRACKETS = [('「', '」'), ('『', '』')]

# A trailing (...)/[...]/【...】 block, possibly repeated — annotations/translations
# tacked onto the end of a title, never removed from the middle of one.
_TRAILING_BRACKET_CHAIN = re.compile(r'\s*[([【]([^()\[\]【】]*)[)\]】]\s*$')


def _strip_junk_phrases(text: str) -> str:
    cleaned = _JUNK_PATTERN.sub(' ', text)
    return re.sub(r'\s{2,}', ' ', cleaned).strip()


def _strip_trailing_bracket_chain(text: str) -> str:
    while True:
        stripped = _TRAILING_BRACKET_CHAIN.sub('', text).strip()
        if stripped == text:
            return text
        text = stripped


def _extract_bracketed_title(title: str) -> Optional[Tuple[str, str]]:
    """Returns (text_before_bracket, extracted_title) for the first 「title」 or 『title』 quote found."""
    for open_b, close_b in _TITLE_BRACKETS:
        start = title.find(open_b)
        end = title.find(close_b, start + 1) if start != -1 else -1
        if start != -1 and end != -1:
            return title[:start].strip(), title[start + 1:end].strip()
    return None


def clean_artist_name(artist: str) -> str:
    """Strips common YouTube channel-name suffixes ('- Topic', 'VEVO', 'Official Channel', ...)."""
    if not artist:
        return artist
    return _ARTIST_SUFFIX_PATTERN.sub('', artist).strip()


def clean_title_artist(raw_title: str, artist_hint: str = "") -> Tuple[str, str]:
    """
    Best-effort extraction of (title, artist) from a raw YouTube video title, given
    an optional artist hint (typically the channel/uploader name). The hint is used
    as a fallback only — when the title itself contains a clear artist/title split
    (a delimiter, or a quoted-title bracket), that wins, since the hint is often just
    whoever reuploaded the video rather than the real performing artist.
    """
    title = raw_title or ""
    artist = (artist_hint or "").strip()

    bracketed = _extract_bracketed_title(title)
    if bracketed:
        prefix, extracted_title = bracketed
        title = extracted_title
        if prefix:
            artist = prefix
    else:
        for delimiter in _ARTIST_TITLE_DELIMITERS:
            if delimiter in title:
                maybe_artist, maybe_title = title.split(delimiter, 1)
                if maybe_artist.strip():
                    artist = maybe_artist.strip()
                title = maybe_title.strip()
                break

    title = _strip_junk_phrases(title)
    title = _strip_trailing_bracket_chain(title)
    title = title.strip(' -/|:「」『』()[]【】').strip()

    artist = _strip_junk_phrases(artist)
    artist = clean_artist_name(artist)

    # De-duplicate: title shouldn't still start with the artist's own name
    # (happens when the bracket/delimiter split left it in, e.g. "YOASOBI 祝福").
    if artist and title.lower().startswith(artist.lower()):
        title = title[len(artist):].strip(' -/|:「」『』')

    return title, artist
