/**
 * Proxies YouTube Data API v3 search server-side so the API key never
 * ships to the browser (the old Solid app shipped VITE_YOUTUBE_API_KEY
 * directly to the client — don't repeat that here).
 */
import type { YouTubeSearchResult } from '~/types/library'

const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3/search'

export default defineEventHandler(async (event): Promise<YouTubeSearchResult[]> => {
  const query = getQuery(event).q
  if (!query || typeof query !== 'string' || !query.trim()) {
    return []
  }

  const apiKey = useRuntimeConfig().youtubeApiKey
  if (!apiKey) {
    throw createError({ statusCode: 500, statusMessage: 'YouTube API key is not configured on the server' })
  }

  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    videoCategoryId: '10', // Music category
    maxResults: '10',
    key: apiKey,
  })

  const response = await fetch(`${YOUTUBE_API_URL}?${params}`)
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw createError({
      statusCode: response.status,
      statusMessage: errorData?.error?.message || 'YouTube API error',
    })
  }

  const data = await response.json()
  const items: any[] = data.items || []

  return items.map((item) => {
    // snippet.channelTitle is the uploader, not necessarily the real artist (e.g. a
    // personal lyric-video reupload channel) — cleanTitleArtist prefers whatever
    // artist/title split the video title itself implies, falling back to the
    // channel name only when the title gives no better signal.
    const { title, artist } = cleanTitleArtist(item.snippet.title, item.snippet.channelTitle)

    return {
      id: item.id.videoId,
      title,
      artist,
      thumbnailUrl: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default.url,
      duration_ms: 0, // Requires a separate videos.list call to resolve; strategies that need real duration use /api/songs/youtube/metadata instead
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
    }
  })
})
