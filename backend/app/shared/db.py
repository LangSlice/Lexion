"""
Shared Supabase client (async — repository methods run inside FastAPI's
event loop and must never block it with the sync client).

NOTE: there is no Supabase Auth session here — ownership (see
song_processing/repository.py) is enforced by comparing an opaque
`owner_token` header in plain Python, not via Postgres RLS keyed on
`auth.uid()`. If Row Level Security is ever added to these tables, it
must NOT be assumed to be the enforcement point; the FastAPI layer is
the sole trust boundary until real Supabase Auth sessions exist.
"""
from typing import Optional

from supabase import create_async_client
from supabase._async.client import AsyncClient

from app.shared.config import settings

_client: Optional[AsyncClient] = None


def supabase_configured() -> bool:
    return bool(settings.SUPABASE_URL and settings.SUPABASE_KEY)


async def get_supabase() -> Optional[AsyncClient]:
    """Shared Supabase client, or None if unconfigured (callers fall back to in-memory storage)."""
    global _client
    if not supabase_configured():
        return None
    if _client is None:
        _client = await create_async_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    return _client
