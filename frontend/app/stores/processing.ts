import { defineStore } from 'pinia'
import type { LyricsStrategyId, ProcessingStage } from '~/types/lyricsStrategy'

export const useProcessingStore = defineStore('processing', {
  state: () => ({
    // 'asr' is the only strategy that never touches a licensed lyrics DB
    // (legacy/hybrid both require ENABLE_LICENSED_LYRICS_PROVIDERS) — default here.
    lastStrategy: 'asr' as LyricsStrategyId,
    stage: 'idle' as ProcessingStage,
    percent: 0,
    message: '',
    error: null as string | null,
  }),

  actions: {
    start(strategy: LyricsStrategyId) {
      this.lastStrategy = strategy
      this.stage = 'fetching-metadata'
      this.percent = 0
      this.message = ''
      this.error = null
    },

    setProgress(stage: ProcessingStage, percent: number, message?: string) {
      this.stage = stage
      this.percent = percent
      if (message) this.message = message
    },

    finish() {
      this.stage = 'done'
      this.percent = 100
    },

    fail(error: string) {
      this.stage = 'error'
      this.error = error
    },

    reset() {
      this.stage = 'idle'
      this.percent = 0
      this.message = ''
      this.error = null
    },
  },

  persist: {
    pick: ['lastStrategy'],
  },
})
