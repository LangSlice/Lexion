<script setup lang="ts">
import { Play } from 'lucide-vue-next'
import { useSongStore } from '~/stores/song'
import { useLanguageStore } from '~/stores/language'

const songStore = useSongStore()
const languageStore = useLanguageStore()
</script>

<template>
  <div :class="songStore.darkMode ? 'dark' : ''">
    <div class="min-h-screen bg-white dark:bg-gray-900 transition-colors">
      <header class="p-4 sm:p-6 flex justify-end items-center gap-4 sticky top-0 z-40 pointer-events-none">
        <div
          class="pointer-events-auto flex items-center gap-3 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md p-2 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800"
        >
          <LanguageSelector />
          <div class="h-8 w-px bg-gray-200 dark:bg-gray-700" />
          <UserSettings />
        </div>
      </header>

      <div class="container mx-auto px-4 pb-16 -mt-24 sm:-mt-28 pt-24 sm:pt-28">
        <div class="flex flex-col items-center justify-center py-12 text-center max-w-3xl mx-auto">
          <h1 class="text-5xl sm:text-7xl font-bold text-gray-800 dark:text-gray-100 mb-4 tracking-tight">LangSlice</h1>
          <p class="text-xl sm:text-2xl text-gray-500 dark:text-gray-400 mb-10">Learn Japanese through music</p>

          <NuxtLink
            to="/library"
            class="inline-flex items-center gap-3 px-8 py-4 bg-[#58CC02] dark:bg-[#45A002] hover:bg-[#4CAF00] dark:hover:bg-[#3A8F00] text-white font-bold text-lg rounded-2xl shadow-[0_4px_0_0_#2d8f02] active:shadow-none active:translate-y-[4px] transition-all mb-12"
          >
            <Play :size="24" fill="white" />
            Start Learning
          </NuxtLink>

          <div class="text-sm text-gray-400 dark:text-gray-500 mb-16">
            <p class="mb-3 font-medium">Keyboard shortcuts</p>
            <div class="flex flex-wrap justify-center gap-3">
              <span class="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">S <span class="opacity-50 ml-1">Play</span></span>
              <span class="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">A/D <span class="opacity-50 ml-1">Nav</span></span>
              <span class="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">N <span class="opacity-50 ml-1">Dark</span></span>
            </div>
          </div>
        </div>

        <div v-if="languageStore.sourceLanguage === 'ja'" class="border-t border-gray-200 dark:border-gray-800 pt-12">
          <CharacterMatrix />
        </div>
      </div>
    </div>
  </div>
</template>
