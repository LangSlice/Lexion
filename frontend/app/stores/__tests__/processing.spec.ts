import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useProcessingStore } from '~/stores/processing'

describe('useProcessingStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('defaults to the asr strategy (the only one that never touches a licensed lyrics DB)', () => {
    const store = useProcessingStore()
    expect(store.lastStrategy).toBe('asr')
  })

  it('start() records whichever strategy is picked', () => {
    const store = useProcessingStore()
    store.start('hybrid')
    expect(store.lastStrategy).toBe('hybrid')
  })
})
