<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeft } from 'lucide-vue-next'
import { useSongStore } from '~/stores/song'
import type { KanjiCandidate } from '~/types/song'

const songStore = useSongStore()

const word = computed(() => songStore.selectedWord)
const lineId = computed(() => songStore.selectedLineId)
const path = computed(() => songStore.selectedWordPath)

function applyCandidate(candidate: KanjiCandidate) {
  if (lineId.value === null || !path.value) return
  songStore.updateWordAtPath(lineId.value, path.value, {
    text: candidate.text,
    script_type: 'kanji',
    meanings: candidate.meanings,
  })
}

function revertToKana() {
  const current = word.value
  if (lineId.value === null || !path.value || !current?.reading) return
  songStore.updateWordAtPath(lineId.value, path.value, {
    text: current.reading,
    script_type: 'hiragana',
  })
}
</script>

<template>
  <div v-if="word" class="flex flex-col gap-2 h-full">
    <button
      type="button"
      class="flex items-center gap-1 text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      @click="songStore.clearWordSelection()"
    >
      <ArrowLeft :size="14" /> Back
    </button>

    <div class="text-sm font-bold text-gray-800 dark:text-gray-200">{{ word.reading ?? word.text }}</div>

    <div class="flex flex-col gap-1.5 overflow-y-auto">
      <button
        v-for="candidate in word.kanji_candidates"
        :key="candidate.text"
        type="button"
        class="text-left px-3 py-2 rounded-xl font-bold transition-all"
        :class="
          word.text === candidate.text
            ? 'bg-[#58CC02] text-white shadow-md scale-105'
            : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700'
        "
        @click="applyCandidate(candidate)"
      >
        <div class="text-base">{{ candidate.text }}</div>
        <div class="text-[10px] font-normal opacity-80">{{ candidate.meanings.join(', ') }}</div>
      </button>

      <button
        type="button"
        class="text-left px-3 py-2 rounded-xl font-bold transition-all"
        :class="
          word.text === word.reading
            ? 'bg-[#58CC02] text-white shadow-md scale-105'
            : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700'
        "
        @click="revertToKana"
      >
        None (use kana: {{ word.reading }})
      </button>
    </div>
  </div>
</template>
