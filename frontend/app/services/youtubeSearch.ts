/**
 * YouTube search — calls our own server route (server/api/youtube/search.get.ts),
 * which proxies YouTube Data API v3 so the API key stays server-side.
 */
import type { YouTubeSearchResult } from '~/types/library'

export async function searchYouTube(query: string): Promise<YouTubeSearchResult[]> {
  if (!query.trim()) return []

  try {
    return await $fetch<YouTubeSearchResult[]>('/api/youtube/search', { query: { q: query } })
  } catch (error) {
    console.error('[YouTube Search] Error:', error)
    return []
  }
}
