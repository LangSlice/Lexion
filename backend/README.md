# LangSlice Backend

Automated song processing pipeline for language learning using feature-based architecture.

## Setup with UV

### 1. Initialize Project

```bash
# Initialize uv project (if not done)
cd backend
uv init

# Sync dependencies
uv sync

# Activate virtual environment
source .venv/bin/activate  # macOS/Linux
# or
.venv\Scripts\activate  # Windows
```

### 2. Configure Environment

```bash
# Copy example env file
cp .env.example .env

# Edit .env with your API keys
# - MUSIXMATCH_API_KEY: optional, needs your own approved Musixmatch developer
#   agreement for full lyrics — see .env.example
# - SUPABASE_URL & SUPABASE_KEY: Get from your Supabase project
```

### 3. Run Development Server

```bash
# Simplest way (recommended)
uv run run.py

# Alternative: using project scripts
uv run dev

# Or activate venv first
source .venv/bin/activate  # macOS/Linux
python run.py
```

Server will be available at: http://localhost:8000

- API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health

## Project Structure

Feature-based architecture where each folder is a self-contained business feature:

```
app/
├── song_processing/       # YouTube URL → processed song JSON
│   ├── models.py          # Pydantic models
│   ├── router.py          # FastAPI endpoints
│   ├── service.py         # Business logic orchestrator
│   ├── youtube.py         # YouTube metadata fetching
│   └── lyrics.py          # Lyrics API integration
│
├── word_analysis/         # Word tokenization & dictionary lookup
│   ├── models.py
│   ├── service.py         # Main analysis orchestrator
│   ├── tokenizer.py       # Language-specific tokenizers
│   ├── dictionary.py      # JMDict, CC-CEDICT, etc.
│   └── syllables.py       # Syllable breakdown
│
├── database/              # Supabase integration & caching
│   ├── models.py
│   └── service.py
│
└── shared/                # Shared utilities
    ├── config.py          # Environment configuration
    ├── language.py        # Language detection
    └── utils.py
```

## API Endpoints

### Process Song
```http
POST /api/songs/process
Content-Type: application/json

{
  "youtubeUrl": "https://youtube.com/watch?v=Cc-Ecr6Yh2Y",
  "targetLanguage": "es"
}
```

### Get Processing Status
```http
GET /api/songs/process/{jobId}
```

### Get Processed Song
```http
GET /api/songs/{songId}
```

## Development

### Add Dependencies

```bash
# Add a new package
uv add package-name

# Add dev dependency
uv add --dev pytest

# Add optional dependency group
uv add --group ai openai
```

### Run Tests

```bash
uv run pytest
```

## Architecture Principles

1. **Feature-based folders**: Each folder is a self-contained business feature
2. **Explicit imports**: Always use absolute imports (e.g., `from app.song_processing.service import ...`)
3. **No __init__.py files**: Makes imports explicit and traceable
4. **Self-documenting**: Copy a feature folder to create a new feature

## Phases

- **Phase 1 (MVP)**: Japanese → Spanish, dictionary-only
- **Phase 2**: Frontend integration
- **Phase 3**: Multi-language support (Chinese, Korean, Russian)
- **Phase 4**: AI enhancement for rare words
