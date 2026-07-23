"""
Pydantic models for song processing
Matches frontend TypeScript interfaces
"""
from typing import List, Optional
from pydantic import BaseModel


class SongMetadata(BaseModel):
    """Song metadata"""
    id: str
    title: str
    title_romaji: str
    title_translation: str
    artist: str
    album: str
    duration_ms: int
    language: str  # Origin language (user's learning target)
    lyrics_language: str = "unknown"  # Actual format: 'japanese'|'romaji'|'mixed'|'unknown'
    lyrics_source: str = "none"  # Source: 'musixmatch'|'asr'|'manual'|'none'
    lyrics_confidence: float = 0.0  # 0.0-1.0 confidence in format detection
    tags: List[str]
    difficulty: str
    release_year: int


class MediaReference(BaseModel):
    """
    Pointer to the user's own media — never the bytes themselves, long-term.
    Kept structurally separate from SongMetadata/Lyrics (derived knowledge) so
    a Course can be exported/shared without ever bundling copyrighted media.
    """
    kind: str = "youtube"  # 'youtube' | 'spotify' | 'upload'
    youtube_id: str = ""
    spotify_id: str = ""
    content_hash: Optional[str] = None  # sha256 hex of the source audio, once known


class Syllable(BaseModel):
    """Individual syllable for pronunciation breakdown"""
    text: str        # Individual character (さ)
    romaji: str      # Romanization (sa)


class KanjiCandidate(BaseModel):
    """One ranked JMdict kanji spelling for a kana word's reading"""
    text: str
    meanings: List[str]


class WordBreakdown(BaseModel):
    """Word breakdown with readings, meanings, and syllables"""
    text: str
    script_type: str  # 'kanji', 'hiragana', 'katakana', 'english'
    reading: Optional[str] = None
    transliteration: str
    meanings: List[str]
    context: Optional[str] = None
    explanation: Optional[str] = None
    position: int
    is_compound: Optional[bool] = False
    sub_words: Optional[List['WordBreakdown']] = None
    syllables: Optional[List[Syllable]] = None
    # Only populated when this word arrived as kana and JMdict had at least one kanji
    # spelling for its reading — `text` above already reflects the top-ranked candidate.
    kanji_candidates: Optional[List[KanjiCandidate]] = None
    # Manually-curated phrase grouping (e.g. phrasal-verb-like unit spanning
    # several sibling words). Only ever set on top-level breakdown entries,
    # never inside sub_words — that axis is intra-word script decomposition,
    # a separate concern from inter-word phrase grouping.
    group_id: Optional[str] = None
    # Real, ASR-derived per-word timing. Never set by the backend — the frontend attaches
    # these client-side (hybrid strategy) after /analyze returns, by interpolating Whisper's
    # word-level ASR timestamps against this word's character offset within the line. Absent
    # means the frontend must fall back to a proportional estimate at render time.
    start_time_ms: Optional[int] = None
    end_time_ms: Optional[int] = None


class PhraseGroup(BaseModel):
    """A manually-curated semantic unit spanning 2+ sibling WordBreakdown entries in a line"""
    id: str
    meaning: str
    translation: Optional[str] = None


class LyricLineText(BaseModel):
    """Text content for a lyric line"""
    original: str
    reading: str
    transliteration: str
    translation: str
    explanation: Optional[str] = None


class LyricLine(BaseModel):
    """A single line of lyrics with timing and breakdown"""
    id: int
    start_time_ms: int
    end_time_ms: int
    text: LyricLineText
    breakdown: List[WordBreakdown]
    phrase_groups: Optional[List[PhraseGroup]] = None


class Lyrics(BaseModel):
    """Complete lyrics for a song"""
    lines: List[LyricLine]


class Song(BaseModel):
    """Complete song: metadata + media reference (content) + lyrics (knowledge)"""
    metadata: SongMetadata
    media: MediaReference
    lyrics: Lyrics


class LyricsResult:
    """Container for lyrics fetch result with metadata"""
    def __init__(
        self,
        lines: List[str],
        format: str,
        confidence: float,
        source: str,
        metadata: dict = None
    ):
        self.lines = lines
        self.format = format
        self.confidence = confidence
        self.source = source
        self.metadata = metadata or {}


# Request/Response models

class ProcessSongRequest(BaseModel):
    """Request to process a new song"""
    youtubeUrl: str
    originLanguage: str = "ja"  # Language the song is IN (Japanese, Korean, etc.)
    targetLanguage: str = "es"  # Language to translate meanings TO (Spanish, English, etc.)
    lyrics: Optional[List[str]] = None  # Optional manual lyrics input
    options: Optional[dict] = {
        "enableAI": False,
        "timestampsMode": "auto"
    }


class ProcessSongResponse(BaseModel):
    """Response after initiating song processing"""
    songId: str
    status: str  # processing | completed | failed
    estimatedTime: int  # seconds


class ProcessingProgress(BaseModel):
    """Progress update for song processing"""
    stage: str
    percentage: int
    message: str


class ProcessingStatus(BaseModel):
    """Status check response"""
    jobId: str
    status: str
    progress: ProcessingProgress


class SongUpdateRequest(BaseModel):
    """Request to update an existing song's lyrics or metadata"""
    metadata: Optional[SongMetadata] = None
    lyrics: Optional[Lyrics] = None


# --- Client-driven pipeline models (ASR / Hybrid lyrics strategies) ---
# These support strategies where the client (in-browser Whisper transcription)
# supplies real timestamps, rather than the server's naive uniform-division estimate.

class TimedLineInput(BaseModel):
    """A single lyric line with a real, client-derived timestamp"""
    start_time_ms: int
    end_time_ms: int
    text: str


class AnalyzeLyricsRequest(BaseModel):
    """Request to run word-analysis only, over client-supplied timed lines"""
    lines: List[TimedLineInput]
    language: str = "ja"
    target_language: str = "es"


class AnalyzeLyricsResponse(BaseModel):
    """Fully word-analyzed lines, with client timestamps preserved verbatim"""
    lines: List[LyricLine]
    estimated_difficulty: str


class StoreSongRequest(BaseModel):
    """Request to store a fully client-assembled song (ASR/Hybrid strategies)"""
    song: Song


class StoreSongResponse(BaseModel):
    """Response after storing a client-assembled song"""
    songId: str


class LyricsFetchRequest(BaseModel):
    """Request to fetch lyrics text only (no word-analysis, no timestamps)"""
    title: str
    artist: str
    youtube_id: str
    origin_language: str = "ja"


class LyricsFetchResponse(BaseModel):
    """Lyrics text fetched from Musixmatch, ready for client-side alignment"""
    lines: List[str]
    format: str
    confidence: float
    source: str
    converted_from_romaji: bool = False


class MediaReferenceExport(BaseModel):
    """Media pointer for a portable course export — never any bytes, ever."""
    kind: str
    youtube_id: str = ""
    spotify_id: str = ""
    content_hash: Optional[str] = None


class CourseExport(BaseModel):
    """
    Portable course.json — the derived-knowledge asset, never the source media.
    If the course's lyrics came from a licensed provider (Musixmatch),
    the verbatim text is redacted (see router.py's export_course) and the
    recipient must re-fetch it themselves; ASR/manual transcriptions are the
    user's own annotation of their own content and are exported as-is.
    """
    format_version: int = 1
    metadata: SongMetadata
    media_reference: MediaReferenceExport
    lyrics: Lyrics
    redacted_licensed_text: bool = False
    exported_at: str


class ImportCourseRequest(BaseModel):
    """Request to import a previously-exported course.json under a new owner"""
    course: CourseExport


class YoutubeMetadataResponse(BaseModel):
    """Cleaned YouTube metadata, for strategies that bypass /process"""
    title: str
    artist: str
    album: str
    duration_ms: int
    youtube_id: str
    tags: List[str]
    release_year: int
