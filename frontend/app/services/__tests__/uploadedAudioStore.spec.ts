import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { deleteFile, getFile, putFile } from '~/services/uploadedAudioStore'

describe('uploadedAudioStore', () => {
  beforeEach(() => {
    // fake-indexeddb persists across tests within the same process — start
    // each test with a fresh database so put/get/delete don't leak state.
    indexedDB = new IDBFactory()
  })

  it('put then get returns the same file', async () => {
    const file = new File(['audio bytes'], 'song.mp3', { type: 'audio/mpeg' })

    await putFile('hash-1', file)
    const retrieved = await getFile('hash-1')

    expect(retrieved).toBeDefined()
    expect(retrieved!.name).toBe('song.mp3')
    expect(await retrieved!.text()).toBe('audio bytes')
  })

  it('get returns undefined for an unknown hash', async () => {
    expect(await getFile('never-stored')).toBeUndefined()
  })

  it('delete removes the file', async () => {
    const file = new File(['audio bytes'], 'song.mp3')
    await putFile('hash-2', file)

    await deleteFile('hash-2')

    expect(await getFile('hash-2')).toBeUndefined()
  })
})
