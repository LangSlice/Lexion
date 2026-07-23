<script setup lang="ts">
import { useSongStore } from '~/stores/song'
import type { ScriptMode } from '~/types/song'

const songStore = useSongStore()

const modes: { value: ScriptMode; label: string; emoji: string }[] = [
  { value: 'original', label: 'Kanji', emoji: '漢' },
  { value: 'furigana', label: 'Hiragana', emoji: 'あ' },
  { value: 'romaji', label: 'Romaji', emoji: 'A' },
]
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="bg-white rounded-2xl shadow-lg p-4 border-2 border-gray-100">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-lg font-bold text-gray-800">Script Mode</h3>
      </div>
      <div class="flex gap-2 flex-wrap">
        <button
          v-for="mode in modes"
          :key="mode.value"
          class="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold transition-all"
          :class="
            songStore.scriptMode === mode.value
              ? 'bg-[#58CC02] text-white shadow-md scale-105'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          "
          @click="songStore.scriptMode = mode.value"
        >
          <span class="text-xl">{{ mode.emoji }}</span>
          <span>{{ mode.label }}</span>
        </button>
      </div>
    </div>

    <div class="bg-white rounded-2xl shadow-lg p-4 border-2 border-gray-100">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-xl">🇪🇸</span>
          <h3 class="text-lg font-bold text-gray-800">Spanish Translation</h3>
        </div>
        <button
          class="relative w-14 h-8 rounded-full transition-all"
          :class="songStore.showTranslation ? 'bg-[#58CC02]' : 'bg-gray-300'"
          @click="songStore.toggleTranslation()"
        >
          <div class="absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-all" :class="songStore.showTranslation ? 'left-7' : 'left-1'" />
        </button>
      </div>
    </div>
  </div>
</template>
