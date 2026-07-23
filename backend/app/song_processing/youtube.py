"""
YouTube metadata fetching service
Uses yt-dlp to extract video information (metadata only, never downloads).

Note: this service used to also download audio bytes server-side via yt-dlp
for client-side transcription. That's been removed — YouTube's Terms of
Service explicitly prohibit third-party download tools, and unlike Musixmatch
there's no operator-approval path that could make it compliant. Transcription
now requires the user to upload their own audio/video file directly (see
frontend/app/services/uploadedAudioStore.ts) — the browser reads those bytes
itself, the backend is never involved. Metadata lookups (this file) stay:
`extract_info(download=False)` never fetches media content, just public
listing data, the same thing YouTube's own oEmbed/Data API would return.
"""
import logging
import yt_dlp
from typing import Dict

from app.song_processing.title_cleaning import clean_artist_name, clean_title_artist

logger = logging.getLogger(__name__)


class YouTubeService:
    """Service for fetching YouTube video metadata"""

    def __init__(self):
        self.ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
        }

    async def fetch_metadata(self, youtube_id: str) -> Dict:
        """
        Fetch metadata for a YouTube video

        Args:
            youtube_id: YouTube video ID (e.g., "Cc-Ecr6Yh2Y")

        Returns:
            Dictionary with title, artist, duration_ms, etc.
        """
        url = f"https://www.youtube.com/watch?v={youtube_id}"

        with yt_dlp.YoutubeDL(self.ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

            # Extract relevant metadata
            raw_title = info.get('title', '')
            uploader = info.get('uploader', '')
            duration = info.get('duration', 0)  # in seconds

            # The uploader is only a fallback artist hint — a delimiter/bracket split
            # found in the title itself (see title_cleaning.py) wins when present,
            # since the uploader is often just whoever reuploaded the video.
            title, artist = clean_title_artist(raw_title, uploader)
            uploader = clean_artist_name(uploader)

            return {
                'title': title,
                'artist': artist,
                'album': '',  # Not available from YouTube
                'duration_ms': duration * 1000,
                'youtube_id': youtube_id,
                'tags': info.get('tags', []),  # First 5 tags
                'release_year': self._extract_year(info.get('description', ''))
            }

    def _extract_year(self, description: str) -> int:
        """Try to extract release year from description"""
        import re
        # Look for 4-digit year pattern
        match = re.search(r'20\d{2}', description)
        if match:
            return int(match.group())
        return 2024  # Default to current year
