export type LyricsStrategyId = 'legacy' | 'asr' | 'hybrid'

/**
 * Carries a strategy's resolved char-to-time timeline forward so useLyricsPipeline
 * can resolve real per-word timestamps after /analyze returns breakdown[] — the
 * backend never sees ASR data, so this join has to happen client-side once
 * dictionary tokenization is known.
 */
export interface WordTimingContext {
  /** One resolved ASR timestamp per char-boundary position (0..N inclusive) in the known-lyrics char-space. */
  apiCharToTimeMs: number[]
  /** Same length/order as the strategy's result.lines — each line's start offset in that same char-space. */
  perLineCharOffset: number[]
}

/** A single lyric line before word-analysis has run — plain text, real timestamp */
export interface DraftLyricLine {
  start_time_ms: number
  end_time_ms: number
  text: string
}

/**
 * The user's own uploaded audio/video file — the only source of actual audio
 * bytes for transcription (ASR/Hybrid). There is no YouTube-audio equivalent:
 * unlike Musixmatch, YouTube has no operator-approval path that could make a
 * server-side download compliant, so it isn't offered at all, gated or not.
 */
export interface UploadedAudioSource {
  file: File
  contentHash: string
}

export interface LyricsStrategyInput {
  /** Present when the song has a YouTube reference — Legacy/Hybrid use this for Musixmatch text fetch + metadata. Absent for upload-only songs. */
  youtubeId?: string
  /** Present when the user has attached their own audio/video file — required by ASR and Hybrid (both need real audio bytes, which now only ever come from an upload). */
  uploadedAudio?: UploadedAudioSource
  /** User-typed lyrics text, bypassing Musixmatch entirely — Legacy's fallback when no lyrics source is otherwise available. */
  manualLyrics?: string[]
  title: string
  artist: string
  durationMsHint?: number
  sourceLanguage: string
  targetLanguage: string
  onProgress?: (stage: string, percent: number, message?: string) => void
}

export interface LyricsStrategyResult {
  lines: DraftLyricLine[]
  lyricsSource: 'musixmatch' | 'asr' | 'manual' | 'none'
  lyricsLanguageHint?: string
  lyricsConfidence?: number
  /**
   * Set only by the Legacy strategy, whose run() fully completes the
   * server-side pipeline (process + fetch) as a side effect rather than
   * producing draft lines for /api/songs/analyze. When present, the
   * orchestrator uses this directly and skips the analyze/store steps.
   */
  completedSongId?: string
  /** Present only for strategies that fetched real ASR word-level timestamps (currently: hybrid). */
  wordTimingContext?: WordTimingContext
}

export interface LyricsStrategy {
  id: LyricsStrategyId
  label: string
  description: string
  requiresAudio: boolean
  requiresLyricsFetch: boolean
  run(input: LyricsStrategyInput): Promise<LyricsStrategyResult>
}

export type ProcessingStage =
  | 'idle'
  | 'fetching-metadata'
  | 'extracting-audio'
  | 'transcribing'
  | 'aligning'
  | 'analyzing'
  | 'saving'
  | 'done'
  | 'error'
