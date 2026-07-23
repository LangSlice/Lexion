<script setup lang="ts">
import type { WordBreakdown } from '~/types/song'

const props = defineProps<{
  word: WordBreakdown
  /** Sub-word cards render one size step smaller than their top-level parent. */
  compact?: boolean
}>()

const emit = defineEmits<{
  update: [updates: Partial<WordBreakdown>]
}>()

function parseMeanings(value: string): string[] {
  return value
    .split(',')
    .map((m) => m.trim())
    .filter((m) => m.length > 0)
}

function onInput(field: 'text' | 'reading' | 'transliteration', event: Event) {
  emit('update', { [field]: (event.target as HTMLInputElement).value })
}

function onMeaningsInput(event: Event) {
  emit('update', { meanings: parseMeanings((event.target as HTMLInputElement).value) })
}
</script>

<template>
  <div class="flex-1 min-w-0 flex flex-col gap-0.5">
    <input
      type="text"
      placeholder="text"
      :value="word.text"
      class="w-full font-semibold px-1 py-0.5 border-b bg-transparent border-gray-300 dark:border-zinc-700 focus:border-[#58CC02] dark:focus:border-[#45A002] focus:outline-none dark:text-gray-200"
      :class="compact ? 'text-[11px]' : 'text-xs'"
      @input="onInput('text', $event)"
    />
    <input
      type="text"
      placeholder="reading"
      :value="word.reading"
      class="w-full px-1 py-0.5 border-b bg-transparent border-gray-300 dark:border-zinc-700 focus:border-[#58CC02] dark:focus:border-[#45A002] focus:outline-none dark:text-gray-400"
      :class="compact ? 'text-[10px]' : 'text-[11px]'"
      @input="onInput('reading', $event)"
    />
    <input
      type="text"
      placeholder="romaji"
      :value="word.transliteration"
      class="w-full italic px-1 py-0.5 border-b bg-transparent border-gray-300 dark:border-zinc-700 focus:border-[#58CC02] dark:focus:border-[#45A002] focus:outline-none dark:text-gray-400"
      :class="compact ? 'text-[10px]' : 'text-[11px]'"
      @input="onInput('transliteration', $event)"
    />
    <input
      type="text"
      placeholder="meanings"
      :value="word.meanings.join(', ')"
      class="w-full px-1 py-0.5 border-b bg-transparent border-gray-300 dark:border-zinc-700 focus:border-[#58CC02] dark:focus:border-[#45A002] focus:outline-none dark:text-gray-400"
      :class="compact ? 'text-[10px]' : 'text-[11px]'"
      @input="onMeaningsInput"
    />
  </div>
</template>
