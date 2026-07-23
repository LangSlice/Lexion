import { describe, expect, it } from 'vitest'
import { fileExtension, hashFile } from '~/utils/fileHash'

describe('hashFile', () => {
  it('produces a stable SHA-256 hex digest for identical content', async () => {
    const fileA = new File(['hello world'], 'a.mp3', { type: 'audio/mpeg' })
    const fileB = new File(['hello world'], 'b.mp3', { type: 'audio/mpeg' })

    const hashA = await hashFile(fileA)
    const hashB = await hashFile(fileB)

    expect(hashA).toBe(hashB)
    expect(hashA).toMatch(/^[0-9a-f]{64}$/)
  })

  it('produces different hashes for different content', async () => {
    const fileA = new File(['hello world'], 'a.mp3')
    const fileB = new File(['goodbye world'], 'a.mp3')

    expect(await hashFile(fileA)).not.toBe(await hashFile(fileB))
  })
})

describe('fileExtension', () => {
  it('extracts the extension without the dot', () => {
    expect(fileExtension('song.mp3')).toBe('mp3')
    expect(fileExtension('my.video.file.webm')).toBe('webm')
  })

  it('falls back to mp4 when there is no extension', () => {
    expect(fileExtension('noextension')).toBe('mp4')
  })
})
