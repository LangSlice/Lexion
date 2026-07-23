<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    text: string
    reading?: string
    transliteration?: string
    scriptType: string
    /** Is the parent line currently playing? Controls the white-on-green vs gray-on-white base look. */
    isActive: boolean
    /** Word-level karaoke state — only meaningful while isActive; defaults to the plain look. */
    wordState?: 'upcoming' | 'current' | 'spoken'
  }>(),
  { wordState: 'upcoming' }
)

const isCurrent = computed(() => props.isActive && props.wordState === 'current')
const isSpoken = computed(() => props.isActive && props.wordState === 'spoken')
</script>

<template>
  <div
    class="flex flex-col items-center transition-colors duration-150"
    :class="isCurrent ? 'bg-white/90 dark:bg-white/90 rounded px-1.5' : ''"
  >
    <span
      class="text-xs h-4"
      :class="
        isCurrent
          ? 'text-[#58CC02]/80 dark:text-[#45A002]/80'
          : isSpoken
            ? 'text-white/30'
            : isActive
              ? 'text-white/70'
              : 'text-gray-500 dark:text-gray-400'
      "
    >
      {{ scriptType === 'kanji' && reading ? reading : ' ' }}
    </span>
    <span class="text-2xl font-bold" :class="isCurrent ? 'text-[#58CC02] dark:text-[#45A002]' : isSpoken ? 'text-white/40' : ''">
      {{ text }}
    </span>
    <span
      class="text-xs italic"
      :class="
        isCurrent
          ? 'text-[#58CC02]/80 dark:text-[#45A002]/80'
          : isSpoken
            ? 'text-white/30'
            : isActive
              ? 'text-white/70'
              : 'text-gray-500 dark:text-gray-400'
      "
    >
      {{ transliteration }}
    </span>
  </div>
</template>
