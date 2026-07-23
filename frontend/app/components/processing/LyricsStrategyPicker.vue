<script setup lang="ts">
import { ref, computed } from 'vue'
import { FileText, Mic, Sparkles, Check, Upload } from 'lucide-vue-next'
import { useProcessingStore } from '~/stores/processing'
import { useFeaturesStore } from '~/stores/features'
import { lyricsStrategyList } from '~/lyrics-strategies'
import type { LyricsStrategyId } from '~/types/lyricsStrategy'

const props = defineProps<{
  /** Does this song have a YouTube reference? Legacy/Hybrid need one for their Musixmatch fetch. */
  hasYoutubeReference: boolean
  /** Has the user attached their own audio/video file? Required by ASR/Hybrid — there's no other source of real audio bytes. */
  hasUsableAudio: boolean
}>()

const emit = defineEmits<{
  pick: [strategyId: LyricsStrategyId]
  'attach-audio': []
  'pick-manual': [lines: string[]]
}>()

const processingStore = useProcessingStore()
const featuresStore = useFeaturesStore()

const visibleStrategies = computed(() =>
  lyricsStrategyList.filter((s) => {
    // Legacy/Hybrid hit Musixmatch — only offered when the backend flag is on
    // AND this song actually has a YouTube reference to fetch text for.
    if (s.requiresLyricsFetch && (!featuresStore.legacyLyricsEnabled || !props.hasYoutubeReference)) return false
    // ASR/Hybrid need real audio bytes — only ever available from an uploaded file.
    if (s.requiresAudio && !props.hasUsableAudio) return false
    return true
  })
)

const selected = ref<LyricsStrategyId>(
  visibleStrategies.value.some((s) => s.id === processingStore.lastStrategy)
    ? processingStore.lastStrategy
    : visibleStrategies.value[0]?.id ?? 'asr'
)

const STRATEGY_ICONS: Record<LyricsStrategyId, typeof FileText> = {
  legacy: FileText,
  asr: Mic,
  hybrid: Sparkles,
}

const manualLyricsText = ref('')

function submitManualLyrics() {
  const lines = manualLyricsText.value.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return
  emit('pick-manual', lines)
}
</script>

<template>
  <div v-if="visibleStrategies.length > 0" class="max-w-3xl mx-auto p-4 sm:p-6">
    <h2 class="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-2 text-center sm:text-left">How should we get the lyrics?</h2>
    <p class="text-gray-500 dark:text-gray-400 mb-6 text-center sm:text-left">This song hasn't been processed yet — tap a strategy.</p>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <button
        v-for="strategy in visibleStrategies"
        :key="strategy.id"
        type="button"
        class="relative flex flex-col items-center text-center gap-3 p-5 sm:p-4 rounded-2xl border-2 transition-all active:scale-95"
        :class="
          selected === strategy.id
            ? 'border-[#58CC02] bg-green-50 dark:bg-green-900/20 shadow-md'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
        "
        @click="selected = strategy.id"
      >
        <div
          v-if="selected === strategy.id"
          class="absolute top-3 right-3 w-6 h-6 rounded-full bg-[#58CC02] flex items-center justify-center"
        >
          <Check :size="14" class="text-white" />
        </div>

        <div
          class="w-14 h-14 rounded-2xl flex items-center justify-center"
          :class="selected === strategy.id ? 'bg-[#58CC02] text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'"
        >
          <component :is="STRATEGY_ICONS[strategy.id]" :size="26" />
        </div>

        <span class="font-bold text-gray-800 dark:text-gray-200">{{ strategy.label }}</span>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ strategy.description }}</p>

        <div class="flex flex-wrap justify-center gap-1.5 mt-1">
          <span v-if="strategy.requiresAudio" class="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">audio</span>
          <span v-if="strategy.requiresLyricsFetch" class="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">lyrics API</span>
        </div>
      </button>
    </div>

    <button
      class="w-full px-6 py-3 bg-[#58CC02] text-white rounded-lg font-medium hover:bg-[#4CAF00] transition-colors"
      @click="emit('pick', selected)"
    >
      Continue
    </button>
  </div>

  <!-- No strategy is available: no audio attached, and either no YouTube reference
       or the Musixmatch flag is off. Offer the two ways to unblock this song. -->
  <div v-else class="max-w-md mx-auto p-4 sm:p-6 text-center">
    <h2 class="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">No lyrics source available yet</h2>
    <p class="text-gray-500 dark:text-gray-400 mb-6 text-sm">
      This song has no audio attached and no lyrics provider enabled. Attach the audio file yourself to unlock transcription, or enter the lyrics manually.
    </p>

    <button
      class="w-full px-6 py-3 mb-4 border-2 border-gray-300 dark:border-gray-600 rounded-lg font-medium text-gray-700 dark:text-gray-300 hover:border-[#58CC02] dark:hover:border-[#45A002] flex items-center justify-center gap-2 transition-colors"
      @click="emit('attach-audio')"
    >
      <Upload :size="18" />
      Attach audio file
    </button>

    <div class="text-left">
      <label class="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Or paste lyrics manually (one line per row)</label>
      <textarea
        v-model="manualLyricsText"
        rows="6"
        class="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 text-sm focus:outline-none focus:border-[#58CC02] dark:focus:border-[#45A002]"
      />
      <button
        :disabled="!manualLyricsText.trim()"
        class="w-full mt-3 px-6 py-3 bg-[#58CC02] text-white rounded-lg font-medium hover:bg-[#4CAF00] disabled:opacity-50 transition-colors"
        @click="submitManualLyrics"
      >
        Continue with manual lyrics
      </button>
    </div>
  </div>
</template>
