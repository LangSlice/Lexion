<script setup lang="ts">
import { ref } from 'vue'
import { User, X } from 'lucide-vue-next'
import { useLanguageStore } from '~/stores/language'

const languageStore = useLanguageStore()
const isOpen = ref(false)

const nativeLanguages = [
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
]

function selectNativeLanguage(code: string) {
  languageStore.setTargetLanguage(code)
  isOpen.value = false
}
</script>

<template>
  <button
    class="p-3 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
    title="Configuración de usuario"
    @click="isOpen = true"
  >
    <User :size="24" />
  </button>

  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
    <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
      <div class="flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-800">
        <h2 class="text-xl font-bold text-gray-800 dark:text-gray-100">Mi Idioma (Origen)</h2>
        <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors" @click="isOpen = false">
          <X :size="24" />
        </button>
      </div>

      <div class="p-4 space-y-2">
        <p class="text-sm text-gray-500 dark:text-gray-400 px-2 mb-4">
          Selecciona el idioma que hablas para ver las traducciones correctas.
        </p>

        <button
          v-for="lang in nativeLanguages"
          :key="lang.code"
          class="w-full p-4 flex items-center justify-between rounded-xl transition-all"
          :class="
            languageStore.targetLanguage === lang.code
              ? 'bg-green-50 dark:bg-green-900/20 border-2 border-[#58CC02]'
              : 'bg-gray-50 dark:bg-gray-800 border-2 border-transparent hover:bg-gray-100 dark:hover:bg-gray-700'
          "
          @click="selectNativeLanguage(lang.code)"
        >
          <div class="flex items-center gap-3">
            <span class="text-3xl">{{ lang.flag }}</span>
            <span class="font-bold" :class="languageStore.targetLanguage === lang.code ? 'text-[#58CC02]' : 'text-gray-700 dark:text-gray-200'">
              {{ lang.label }}
            </span>
          </div>
          <div v-if="languageStore.targetLanguage === lang.code" class="w-4 h-4 rounded-full bg-[#58CC02]" />
        </button>
      </div>
    </div>
  </div>
</template>
