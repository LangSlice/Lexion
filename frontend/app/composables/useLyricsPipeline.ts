/**
 * Orchestrates a chosen lyrics strategy end-to-end and returns the resulting
 * backend songId, driving useProcessingStore's progress state along the way.
 *
 * Legacy short-circuits (its run() already stored the song server-side).
 * ASR/Hybrid produce draft lines that still need word-analysis (/analyze),
 * metadata, and storage (/songs) before there's a real songId to load.
 */
import { useProcessingStore } from '~/stores/processing'
import { lyricsStrategies } from '~/lyrics-strategies'
import { analyzeTimedLyrics, getYoutubeMetadata, storeSong } from '~/services/songApi'
import { timeForWordBoundaries } from '~/lyrics-strategies/charPositionAlignment'
import type { LyricsStrategyId, UploadedAudioSource, WordTimingContext } from '~/types/lyricsStrategy'
import type { LyricLine, Song } from '~/types/song'

/**
 * Resolves real per-word timestamps for each analyzed line by looking them up in the
 * strategy's char-to-time alignment timeline, then clamps them into that line's own
 * [start, end) window and forces non-decreasing order across words — words inside a
 * substituted/deleted (interpolated) span can still land slightly outside the line's own
 * boundaries, so clamping rather than taking them at face value. Mutates `lines` in place.
 */
function attachWordTimings(lines: LyricLine[], ctx: WordTimingContext) {
  lines.forEach((line, lineIndex) => {
    const containerCharOffset = ctx.perLineCharOffset[lineIndex]
    if (containerCharOffset === undefined) return

    const words = line.breakdown.map((word) => word.text)
    const timings = timeForWordBoundaries(ctx.apiCharToTimeMs, containerCharOffset, words)

    let previousEnd = line.start_time_ms
    line.breakdown.forEach((word, wordIndex) => {
      const timing = timings[wordIndex]
      if (!timing) return

      const clampedStart = Math.min(Math.max(timing.start_time_ms, line.start_time_ms), line.end_time_ms)
      const clampedEnd = Math.min(Math.max(timing.end_time_ms, clampedStart), line.end_time_ms)

      word.start_time_ms = Math.max(clampedStart, previousEnd)
      word.end_time_ms = Math.max(clampedEnd, word.start_time_ms)
      previousEnd = word.end_time_ms
    })
  })
}

export interface RunLyricsPipelineParams {
  /** Present when the song has a YouTube reference (Legacy/Hybrid need it for their Musixmatch fetch + metadata). */
  youtubeId?: string
  /** Present when the user has attached their own file — required by ASR/Hybrid for actual audio bytes. */
  uploadedAudio?: UploadedAudioSource
  /** User-typed lyrics, bypassing Musixmatch — only meaningful for the Legacy strategy. */
  manualLyrics?: string[]
  title: string
  artist: string
  /** Only used when there's no youtubeId to fetch real duration from (upload-only songs). */
  durationMsHint?: number
  sourceLanguage: string
  targetLanguage: string
}

export function useLyricsPipeline() {
  const processingStore = useProcessingStore()

  async function run(strategyId: LyricsStrategyId, params: RunLyricsPipelineParams): Promise<string> {
    processingStore.start(strategyId)
    const strategy = lyricsStrategies[strategyId]

    try {
      const result = await strategy.run({
        youtubeId: params.youtubeId,
        uploadedAudio: params.uploadedAudio,
        manualLyrics: params.manualLyrics,
        title: params.title,
        artist: params.artist,
        sourceLanguage: params.sourceLanguage,
        targetLanguage: params.targetLanguage,
        onProgress: (stage, percent, message) => processingStore.setProgress(stage as any, percent, message),
      })

      if (result.completedSongId) {
        processingStore.finish()
        return result.completedSongId
      }

      // YouTube metadata is only fetchable/relevant when the song actually has a
      // YouTube reference — an upload-only song has no such lookup, its title/
      // artist/duration come straight from what the user entered at upload time.
      let metadata: { title: string; artist: string; album: string; duration_ms: number; tags: string[]; release_year: number }
      if (params.youtubeId) {
        processingStore.setProgress('fetching-metadata', 88, 'Fetching song metadata...')
        metadata = await getYoutubeMetadata(params.youtubeId)
      } else {
        metadata = {
          title: params.title,
          artist: params.artist,
          album: '',
          duration_ms: params.durationMsHint ?? 0,
          tags: [],
          release_year: new Date().getFullYear(),
        }
      }

      processingStore.setProgress('analyzing', 92, 'Analyzing words...')

      // The backend silently drops blank-text lines (analyze_timed_lyrics). Pre-filter here
      // so analyzed.lines stays index-aligned with wordTimingContext.perLineCharOffset —
      // otherwise a blank line anywhere would shift every subsequent line's word timing by one.
      const nonBlankIndices = result.lines.flatMap((line, i) => (line.text.trim().length > 0 ? [i] : []))
      // Indices come from iterating result.lines itself, always in-bounds — safe to assert.
      const linesToAnalyze = nonBlankIndices.map((i) => result.lines[i]!)

      const analyzed = await analyzeTimedLyrics(linesToAnalyze, params.sourceLanguage, params.targetLanguage)

      if (result.wordTimingContext) {
        const timingContext = result.wordTimingContext
        const alignedCharOffset = nonBlankIndices.map((i) => timingContext.perLineCharOffset[i]!)
        attachWordTimings(analyzed.lines, { ...timingContext, perLineCharOffset: alignedCharOffset })
      }

      const song: Song = {
        metadata: {
          id: '',
          title: metadata.title,
          title_romaji: '',
          title_translation: '',
          artist: metadata.artist,
          album: metadata.album,
          duration_ms: metadata.duration_ms,
          language: params.sourceLanguage,
          lyrics_language: result.lyricsLanguageHint || 'unknown',
          lyrics_source: result.lyricsSource,
          lyrics_confidence: result.lyricsConfidence ?? 0,
          tags: metadata.tags,
          difficulty: analyzed.estimated_difficulty,
          release_year: metadata.release_year,
        },
        // 'upload' whenever a file is attached — even if a youtubeId also exists for
        // display/thumbnail purposes — since that's the only thing that actually
        // satisfies "only your own file's bytes get processed" (see docs/product-architecture.md §2).
        media: params.uploadedAudio
          ? { kind: 'upload', content_hash: params.uploadedAudio.contentHash }
          : { kind: 'youtube', youtube_id: params.youtubeId },
        lyrics: { lines: analyzed.lines },
      }

      processingStore.setProgress('saving', 97, 'Saving song...')
      const songId = await storeSong(song)

      processingStore.finish()
      return songId
    } catch (error) {
      processingStore.fail(error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  return { run }
}
