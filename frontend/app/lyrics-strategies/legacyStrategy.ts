/**
 * Legacy strategy: today's server-side pipeline, unchanged. yt-dlp metadata,
 * Musixmatch lyrics fetch, and naive uniform-division timestamps all
 * happen backend-side in a single /songs/process call.
 *
 * Its run() fully completes the pipeline as a side effect and returns the
 * resulting songId via `completedSongId` — the orchestrator (useLyricsPipeline)
 * detects this and skips the /analyze + /songs (store) steps that the ASR and
 * Hybrid strategies need.
 */
import { processSong } from '~/services/songApi'
import type { LyricsStrategy, LyricsStrategyInput, LyricsStrategyResult } from '~/types/lyricsStrategy'

export const legacyStrategy: LyricsStrategy = {
  id: 'legacy',
  label: 'Legacy (Musixmatch text)',
  description: 'Fetches lyric text from Musixmatch. Timestamps are an even split across the song — fast, but not audio-synced.',
  requiresAudio: false,
  requiresLyricsFetch: true,

  async run(input: LyricsStrategyInput): Promise<LyricsStrategyResult> {
    if (!input.youtubeId) {
      throw new Error('Legacy strategy requires a YouTube reference — it processes the video server-side.')
    }
    input.onProgress?.('fetching-metadata', 10, 'Fetching lyrics and analyzing words...')
    const songId = await processSong(input.youtubeId, input.sourceLanguage, input.targetLanguage, input.manualLyrics ?? null)
    input.onProgress?.('analyzing', 90, 'Song processed')

    return {
      lines: [],
      lyricsSource: 'musixmatch',
      completedSongId: songId,
    }
  },
}
