"""
LangSlice Backend - FastAPI Application
Feature-based architecture for automated song processing
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.shared.config import settings
from app.song_processing.router import router as song_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)

# Reduce noise from libraries
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)
logger.info(f"LangSlice API starting - Debug mode: {settings.DEBUG}")

app = FastAPI(
    title="LangSlice API",
    description="Automated song word breakdown for language learning",
    version="0.1.0",
)

# CORS middleware to allow frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include feature routers
app.include_router(song_router, prefix="/api/songs", tags=["songs"])


@app.get("/")
async def root():
    """Health check endpoint"""
    return {"status": "running", "service": "LangSlice API", "version": "0.1.0"}


@app.get("/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "database": "connected" if settings.SUPABASE_URL else "not configured",
        "musixmatch_api": "configured" if settings.MUSIXMATCH_API_KEY else "not configured",
    }


@app.get("/api/features")
async def get_features():
    """Feature-flag state the frontend needs at boot (e.g. to hide gated UI)"""
    return {"legacy_lyrics_enabled": settings.ENABLE_LICENSED_LYRICS_PROVIDERS}
