/**
 * Lightweight, energy-based voice-activity detection used to snap Whisper's
 * occasionally-sloppy segment boundaries onto real speech edges in the raw
 * audio. Own implementation of a technique also used in subtitler/'s subtitle
 * normalizer (RMS-per-frame + adaptive threshold + run merging, then
 * boundary-snapping) — independently written, not copied.
 */

export interface SpeechRun {
  startMs: number
  endMs: number
}

interface TimedSegment {
  start_time_ms: number
  end_time_ms: number
}

const FRAME_MS = 40
const HOP_MS = 20
const MERGE_GAP_MS = 160
const SNAP_WINDOW_MS = 400

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length))
  return sorted[idx] ?? 0
}

/** Detects contiguous speech-energy regions in a mono PCM buffer */
export function computeSpeechRuns(pcm: Float32Array, sampleRate: number): SpeechRun[] {
  const frameSize = Math.round((FRAME_MS / 1000) * sampleRate)
  const hopSize = Math.round((HOP_MS / 1000) * sampleRate)
  if (pcm.length < frameSize) return []

  const frameEnergies: number[] = []
  for (let start = 0; start + frameSize <= pcm.length; start += hopSize) {
    let sumSquares = 0
    for (let i = start; i < start + frameSize; i++) {
      const sample = pcm[i] ?? 0
      sumSquares += sample * sample
    }
    frameEnergies.push(Math.sqrt(sumSquares / frameSize))
  }

  const sortedEnergies = [...frameEnergies].sort((a, b) => a - b)
  const noiseFloor = percentile(sortedEnergies, 0.2)
  const speechLevel = percentile(sortedEnergies, 0.85)
  const threshold = Math.max(0.003, noiseFloor * 4, speechLevel * 0.12)

  const runs: SpeechRun[] = []
  let runStartFrame: number | null = null

  for (let frame = 0; frame < frameEnergies.length; frame++) {
    const isSpeech = (frameEnergies[frame] ?? 0) >= threshold

    if (isSpeech && runStartFrame === null) {
      runStartFrame = frame
    } else if (!isSpeech && runStartFrame !== null) {
      runs.push({
        startMs: (runStartFrame * hopSize) / (sampleRate / 1000),
        endMs: (frame * hopSize + frameSize) / (sampleRate / 1000),
      })
      runStartFrame = null
    }
  }
  if (runStartFrame !== null) {
    runs.push({
      startMs: (runStartFrame * hopSize) / (sampleRate / 1000),
      endMs: (frameEnergies.length * hopSize + frameSize) / (sampleRate / 1000),
    })
  }

  // Merge runs separated by small gaps (breath pauses shouldn't split a line)
  const merged: SpeechRun[] = []
  for (const run of runs) {
    const last = merged.at(-1)
    if (last && run.startMs - last.endMs <= MERGE_GAP_MS) {
      last.endMs = run.endMs
    } else {
      merged.push({ ...run })
    }
  }

  return merged
}

function nearestEdge(targetMs: number, runs: SpeechRun[]): number | null {
  let best: number | null = null
  let bestDistance = Infinity

  for (const run of runs) {
    for (const edge of [run.startMs, run.endMs]) {
      const distance = Math.abs(edge - targetMs)
      if (distance <= SNAP_WINDOW_MS && distance < bestDistance) {
        best = edge
        bestDistance = distance
      }
    }
  }
  return best
}

/**
 * Snaps each segment's start/end onto the nearest real speech-energy edge
 * within a small window, then resolves any overlaps this creates between
 * adjacent segments by splitting the difference at the boundary midpoint.
 */
export function snapSegmentsToSpeechRuns<T extends TimedSegment>(segments: T[], runs: SpeechRun[]): T[] {
  if (runs.length === 0 || segments.length === 0) return segments

  const snapped = segments.map((segment) => ({
    ...segment,
    start_time_ms: nearestEdge(segment.start_time_ms, runs) ?? segment.start_time_ms,
    end_time_ms: nearestEdge(segment.end_time_ms, runs) ?? segment.end_time_ms,
  }))

  for (let i = 1; i < snapped.length; i++) {
    const prev = snapped[i - 1]
    const curr = snapped[i]
    if (!prev || !curr) continue
    if (curr.start_time_ms < prev.end_time_ms) {
      const midpoint = Math.floor((prev.end_time_ms + curr.start_time_ms) / 2)
      prev.end_time_ms = midpoint
      curr.start_time_ms = midpoint
    }
  }

  return snapped
}
