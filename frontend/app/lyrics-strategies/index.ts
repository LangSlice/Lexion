import { legacyStrategy } from '~/lyrics-strategies/legacyStrategy'
import { asrStrategy } from '~/lyrics-strategies/asrStrategy'
import { hybridStrategy } from '~/lyrics-strategies/hybridStrategy'
import type { LyricsStrategy, LyricsStrategyId } from '~/types/lyricsStrategy'

export const lyricsStrategies: Record<LyricsStrategyId, LyricsStrategy> = {
  legacy: legacyStrategy,
  asr: asrStrategy,
  hybrid: hybridStrategy,
}

export const lyricsStrategyList: LyricsStrategy[] = [legacyStrategy, asrStrategy, hybridStrategy]
