"""
Shared configuration settings
Loads environment variables and provides app config
"""

import os
from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings from environment variables"""

    # Database
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SUPABASE_ANON: str = ""

    # External APIs
    MUSIXMATCH_API_KEY: str = ""

    # AI APIs (Optional - Phase 4)
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""

    # Feature Flags
    ENABLE_AI_FALLBACK: bool = False
    MAX_AI_CALLS_PER_SONG: int = 3
    # Deterministic (no external API) romaji->kana conversion for JP lyrics fetched
    # in romanized form. Local/free, so on by default unlike the AI-gated features.
    ENABLE_ROMAJI_CONVERSION: bool = True
    # Licensed lyrics-provider fallback (Musixmatch). OFF by default per the legal
    # architecture doc — verbatim licensed lyrics text must never be the
    # default/primary source. Only enable this if you have your own Musixmatch
    # developer approval/license covering full-lyrics access for this app.
    ENABLE_LICENSED_LYRICS_PROVIDERS: bool = False

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",  # Nuxt dev server
    ]

    # Development
    DEBUG: bool = True
    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = ".env"
        case_sensitive = True

    def validate_config(self):
        """Validate configuration on startup"""
        warnings = []

        if not self.MUSIXMATCH_API_KEY:
            warnings.append(
                "No lyrics sources configured. Add MUSIXMATCH_API_KEY (and your "
                "own Musixmatch developer approval) to enable lyrics fetching."
            )

        return warnings


settings = Settings()

# Log configuration warnings
import logging
logger = logging.getLogger(__name__)
for warning in settings.validate_config():
    logger.warning(warning)
