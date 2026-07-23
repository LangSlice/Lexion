/**
 * Song API Service
 * Handles all backend REST calls to the FastAPI song-processing service.
 */
import type { Song } from '~/types/song'
import type { DraftLyricLine } from '~/types/lyricsStrategy'
import { apiFetch } from '~/services/apiClient'

function apiBase(): string {
  return useRuntimeConfig().public.apiBase
}

// --- Legacy pipeline (server-side Musixmatch fetch + naive timestamps) ---

export async function processSong(
  youtubeId: string,
  sourceLanguage: string,
  targetLanguage: string,
  manualLyrics: string[] | null = null
): Promise<string> {
  const result = await apiFetch<{ songId: string }>('/songs/process', {
    method: 'POST',
    body: {
      youtubeUrl: `https://youtube.com/watch?v=${youtubeId}`,
      originLanguage: sourceLanguage, // wire field name kept for backend API contract
      targetLanguage,
      lyrics: manualLyrics,
      options: { enableAI: false, timestampsMode: 'auto' },
    },
  })
  return result.songId
}

export async function getProcessingStatus(jobId: string) {
  return $fetch(`${apiBase()}/songs/process/${jobId}`)
}

// --- Shared ---

export async function getSongData(songId: string): Promise<Song> {
  return apiFetch<Song>(`/songs/${songId}`)
}

export async function updateSong(songId: string, song: Song): Promise<Song> {
  return apiFetch<Song>(`/songs/${songId}`, { method: 'PUT', body: song })
}

// --- ASR / Hybrid pipeline (client-derived timestamps) ---

export interface AnalyzeLyricsResult {
  lines: import('~/types/song').LyricLine[]
  estimated_difficulty: string
}

export async function analyzeTimedLyrics(
  lines: DraftLyricLine[],
  sourceLanguage: string,
  targetLanguage: string
): Promise<AnalyzeLyricsResult> {
  return $fetch<AnalyzeLyricsResult>(`${apiBase()}/songs/analyze`, {
    method: 'POST',
    body: { lines, language: sourceLanguage, target_language: targetLanguage },
  })
}

export async function storeSong(song: Song): Promise<string> {
  const result = await apiFetch<{ songId: string }>('/songs', { method: 'POST', body: { song } })
  return result.songId
}

export interface LyricsFetchResult {
  lines: string[]
  format: string
  confidence: number
  source: string
  converted_from_romaji?: boolean
}

export async function fetchLyricsOnly(
  title: string,
  artist: string,
  youtubeId: string,
  sourceLanguage: string
): Promise<LyricsFetchResult> {
  return $fetch<LyricsFetchResult>(`${apiBase()}/songs/lyrics/fetch`, {
    method: 'POST',
    body: { title, artist, youtube_id: youtubeId, origin_language: sourceLanguage },
  })
}

export interface YoutubeMetadata {
  title: string
  artist: string
  album: string
  duration_ms: number
  youtube_id: string
  tags: string[]
  release_year: number
}

export async function getYoutubeMetadata(youtubeId: string): Promise<YoutubeMetadata> {
  return $fetch<YoutubeMetadata>(`${apiBase()}/songs/youtube/metadata/${youtubeId}`)
}
