/**
 * Library management types for collections, albums, and song references
 */

export type Provider = 'youtube' | 'spotify' | 'upload'

/**
 * Reference to a song (not yet processed or already processed)
 * Stored in localStorage, lightweight representation
 */
export interface SongReference {
  id: string // UUID
  title: string
  artist: string
  thumbnailUrl: string
  provider: Provider
  youtubeId?: string // For YouTube songs — also settable on an 'upload' reference if the user attached their own file to a YouTube-discovered song (unlocks ASR/Hybrid on it)
  spotifyId?: string // For Spotify songs (future)
  contentHash?: string // SHA-256 of the uploaded file, keys frontend/app/services/uploadedAudioStore.ts
  uploadedFileName?: string // Display name for the uploaded file, e.g. in the library list badge
  duration_ms: number
  addedAt: number // timestamp

  // Processing state
  isProcessed: boolean
  processedSongId?: string // References backend's processed song ID

  // Album categorization
  genre?: string // Chill, EDM, Pop, Folk, Indie, Classic
}

/**
 * Album - a collection of song references
 * Like a Spotify playlist
 */
export interface Album {
  id: string // UUID
  name: string
  collectionId: string // Parent collection
  songReferences: SongReference[]
  createdAt: number
  coverImages: string[] // First 4 song thumbnails for mosaic
}

/**
 * Collection - language-based grouping of albums
 * e.g., "Japanese Songs", "Spanish Songs"
 */
export interface Collection {
  id: string // UUID
  name: string // "Japanese Songs", "Spanish Songs"
  language: string // "ja", "es", etc.
  albums: Album[]
  createdAt: number
  songCount: number // Computed from all albums
}

/**
 * YouTube Search API response item
 */
export interface YouTubeSearchResult {
  id: string
  title: string
  artist: string // From channelTitle (reliable)
  thumbnailUrl: string
  duration_ms: number
  channelTitle?: string // YouTube channel name
  publishedAt?: string // ISO 8601 date string
}

