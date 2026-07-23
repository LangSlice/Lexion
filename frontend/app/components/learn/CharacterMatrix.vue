<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLanguageStore } from '~/stores/language'
import type { Character } from '~/stores/language'

const languageStore = useLanguageStore()
const activeTab = ref('hiragana')

const currentAlphabet = computed(() => {
  const data = languageStore.languageData
  if (!data) return null
  return data.alphabets.find((a) => a.alphabetSessionId === activeTab.value) || null
})

function playAudio(url: string | null) {
  if (!url) return
  new Audio(url).play().catch((e) => console.error('Audio play failed', e))
}

function isChar(char: Character | undefined): char is Character {
  return !!char
}
</script>

<template>
  <div class="w-full max-w-4xl mx-auto p-4">
    <div v-if="!languageStore.languageData" class="text-center p-8">Loading language data...</div>

    <template v-else>
      <div class="flex border-b border-gray-200 dark:border-gray-700 mb-8">
        <button
          v-for="alphabet in languageStore.languageData.alphabets"
          :key="alphabet.alphabetSessionId"
          class="flex-1 py-4 text-center font-bold text-lg transition-colors border-b-2"
          :class="
            activeTab === alphabet.alphabetSessionId
              ? 'border-[#58CC02] text-[#58CC02]'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          "
          @click="activeTab = alphabet.alphabetSessionId"
        >
          {{ alphabet.alphabetSessionId.toUpperCase() }}
        </button>
      </div>

      <div v-if="currentAlphabet" class="space-y-12">
        <div
          v-for="(group, groupIndex) in currentAlphabet.groups"
          :key="groupIndex"
          class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm"
        >
          <div class="mb-6">
            <h3 class="text-2xl font-bold text-gray-800 dark:text-gray-100">{{ group.title }}</h3>
            <p class="text-gray-500 dark:text-gray-400">{{ group.subtitle }}</p>
          </div>

          <div
            class="grid gap-4"
            :style="{ gridTemplateColumns: `repeat(${group.characters[0]?.length || 5}, minmax(0, 1fr))` }"
          >
            <template v-for="(row, rowIndex) in group.characters" :key="rowIndex">
              <button
                v-for="(char, charIndex) in row.filter(isChar)"
                :key="charIndex"
                class="aspect-square flex flex-col items-center justify-center rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-[#58CC02] hover:bg-green-50 dark:hover:bg-green-900/20 transition-all"
                @click="playAudio(char.ttsUrl)"
              >
                <span class="text-xl sm:text-2xl font-bold text-gray-800 dark:text-gray-100 mb-1">{{ char.character }}</span>
                <span class="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{{ char.transliteration }}</span>
              </button>
            </template>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
