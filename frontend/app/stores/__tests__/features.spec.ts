import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFeaturesStore } from '~/stores/features'
import { getFeatures } from '~/services/featuresApi'

vi.mock('~/services/featuresApi', () => ({
  getFeatures: vi.fn(),
}))

describe('useFeaturesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(getFeatures).mockReset()
  })

  it('defaults legacyLyricsEnabled to false (safe/restrictive) before loading', () => {
    const store = useFeaturesStore()
    expect(store.legacyLyricsEnabled).toBe(false)
    expect(store.loaded).toBe(false)
  })

  it('load() reflects the backend flag on success', async () => {
    vi.mocked(getFeatures).mockResolvedValue({ legacy_lyrics_enabled: true })
    const store = useFeaturesStore()

    await store.load()

    expect(store.legacyLyricsEnabled).toBe(true)
    expect(store.loaded).toBe(true)
  })

  it('load() keeps the safe default if the backend is unreachable', async () => {
    vi.mocked(getFeatures).mockRejectedValue(new Error('network error'))
    const store = useFeaturesStore()

    await store.load()

    expect(store.legacyLyricsEnabled).toBe(false)
    expect(store.loaded).toBe(true)
  })
})
