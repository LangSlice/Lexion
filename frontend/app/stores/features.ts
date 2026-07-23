import { defineStore } from 'pinia'
import { getFeatures } from '~/services/featuresApi'

export const useFeaturesStore = defineStore('features', {
  state: () => ({
    legacyLyricsEnabled: false,
    loaded: false,
  }),

  actions: {
    async load() {
      try {
        const features = await getFeatures()
        this.legacyLyricsEnabled = features.legacy_lyrics_enabled
      } catch {
        // Backend unreachable at boot — keep the safe default (disabled).
        this.legacyLyricsEnabled = false
      } finally {
        this.loaded = true
      }
    },
  },
})
