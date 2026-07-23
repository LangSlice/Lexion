<script setup lang="ts">
import { ref, computed } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { useLanguageStore } from '~/stores/language'

const languageStore = useLanguageStore()
const isOpen = ref(false)

const learnableLanguages = [
  { code: 'ja', label: 'Japonés', flag: '🇯🇵' },
  { code: 'en', label: 'Inglés', flag: '🇺🇸', disabled: true },
]

const currentLang = computed(
  () => learnableLanguages.find((l) => l.code === languageStore.sourceLanguage) || learnableLanguages[0]!
)

function selectLanguage(lang: (typeof learnableLanguages)[number]) {
  if (lang.disabled) return
  languageStore.setSourceLanguage(lang.code)
  isOpen.value = false
}
</script>

<template>
  <div class="relative z-50">
    <button
      class="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all text-gray-700 dark:text-gray-200 font-bold shadow-sm hover:shadow-md"
      @click="isOpen = !isOpen"
    >
      <span class="text-2xl">{{ currentLang.flag }}</span>
      <span class="hidden sm:inline text-lg">{{ currentLang.label }}</span>
      <ChevronDown :size="20" class="text-gray-400 transition-transform duration-200" :class="isOpen ? 'rotate-180' : ''" />
    </button>

    <div
      v-if="isOpen"
      class="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden py-2"
    >
      <div class="px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Quiero aprender...</div>
      <button
        v-for="lang in learnableLanguages"
        :key="lang.code"
        :disabled="lang.disabled"
        class="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        :class="[
          lang.disabled ? 'opacity-50 cursor-not-allowed' : '',
          languageStore.sourceLanguage === lang.code ? 'bg-green-50 dark:bg-green-900/10 text-green-600' : '',
        ]"
        @click="selectLanguage(lang)"
      >
        <span class="text-2xl">{{ lang.flag }}</span>
        <div>
          <div class="font-bold">{{ lang.label }}</div>
          <div v-if="lang.disabled" class="text-xs text-gray-400 font-normal">Próximamente</div>
        </div>
      </button>
    </div>

    <div v-if="isOpen" class="fixed inset-0 -z-10" @click="isOpen = false" />
  </div>
</template>
