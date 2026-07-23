/**
 * Main-thread RPC bridge to workers/whisperTranscriber.worker.ts.
 * Lazily spins up a single worker per app lifetime (idle users never pay
 * the worker/model startup cost) and resolves an id-keyed pending-promise
 * table as messages arrive.
 */
import type { TranscriptionResult } from '~/workers/whisperTranscriber.worker'

const DEFAULT_MODEL_ID = 'Xenova/whisper-base'

export interface TranscribeOptions {
  language?: string
  timestampGranularity?: 'segment' | 'word'
}

export interface ModelProgress {
  progress: number
  file: string
  status: string
}

class WhisperWorkerBridge {
  private worker: Worker | null = null
  private nextRequestId = 1
  private pending = new Map<number, { resolve: (r: TranscriptionResult) => void; reject: (e: Error) => void }>()
  private onModelProgress: ((progress: ModelProgress) => void) | null = null

  private ensureWorker(): Worker {
    if (this.worker) return this.worker

    this.worker = new Worker(new URL('../workers/whisperTranscriber.worker.ts', import.meta.url), {
      type: 'module',
    })

    this.worker.onmessage = (event: MessageEvent) => {
      const message = event.data

      if (message.kind === 'model-progress') {
        this.onModelProgress?.(message.payload)
        return
      }
      if (message.kind === 'segment-progress') {
        return
      }

      const pending = this.pending.get(message.requestId)
      if (!pending) return
      this.pending.delete(message.requestId)

      if (message.kind === 'result') pending.resolve(message.payload)
      else pending.reject(new Error(message.payload?.message || 'Whisper worker failed'))
    }

    return this.worker
  }

  private send<T = TranscriptionResult>(kind: string, payload: unknown): Promise<T> {
    const worker = this.ensureWorker()
    const requestId = this.nextRequestId++

    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, { resolve: resolve as any, reject })
      worker.postMessage({ requestId, kind, payload })
    })
  }

  async prepareModel(modelId: string, onProgress?: (progress: ModelProgress) => void): Promise<void> {
    this.onModelProgress = onProgress || null
    await this.send('prepare-model', { modelId })
  }

  async transcribe(pcm: Float32Array, options: TranscribeOptions = {}): Promise<TranscriptionResult> {
    return this.send('run-transcription', {
      pcm,
      language: options.language,
      timestampGranularity: options.timestampGranularity ?? 'segment',
    })
  }

  terminate() {
    this.worker?.terminate()
    this.worker = null
    this.pending.clear()
  }
}

let singleton: WhisperWorkerBridge | null = null

export function useWhisperClient() {
  if (!singleton) singleton = new WhisperWorkerBridge()

  return {
    modelId: DEFAULT_MODEL_ID,
    prepareModel: (onProgress?: (progress: ModelProgress) => void) => singleton!.prepareModel(DEFAULT_MODEL_ID, onProgress),
    transcribe: (pcm: Float32Array, options?: TranscribeOptions) => singleton!.transcribe(pcm, options),
  }
}
