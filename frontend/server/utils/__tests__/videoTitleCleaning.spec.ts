import { describe, expect, it } from 'vitest'
import { cleanArtistName, cleanTitleArtist } from '../videoTitleCleaning'

describe('cleanTitleArtist', () => {
  it('lets a title delimiter override a bad channel-name hint', () => {
    const { title, artist } = cleanTitleArtist(
      'YOASOBI / 祝福 (Shukufuku) (The Blessing) Full Version Lyrics [Kan_Rom_Eng]',
      'Kei Takahashi'
    )
    expect(title).toBe('祝福')
    expect(artist).toBe('YOASOBI')
  })

  it('extracts a quoted-bracket title and strips a trailing annotation', () => {
    const { title, artist } = cleanTitleArtist(
      'YOASOBI「祝福」Official Music Video (『機動戦士ガンダム 水星の魔女』オープニングテーマ)',
      'YOASOBI'
    )
    expect(title).toBe('祝福')
    expect(artist).toBe('YOASOBI')
  })

  it('keeps the hint when the title has no extractable pattern', () => {
    const { title, artist } = cleanTitleArtist('Some Song Official Video', 'Real Artist')
    expect(title).toBe('Some Song')
    expect(artist).toBe('Real Artist')
  })
})

describe('cleanArtistName', () => {
  it('strips common channel-name suffixes', () => {
    expect(cleanArtistName('MYTH & ROID Official Channel')).toBe('MYTH & ROID')
    expect(cleanArtistName('MYTH & ROID - Topic')).toBe('MYTH & ROID')
    expect(cleanArtistName('Taylor Swift VEVO')).toBe('Taylor Swift')
  })
})
