<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Music, Moon, Sun } from 'lucide-vue-next'
import { useLibraryStore } from '~/stores/library'
import { useSongStore } from '~/stores/song'

const libraryStore = useLibraryStore()
const songStore = useSongStore()
const router = useRouter()

const showCreateModal = ref(false)
const newCollectionName = ref('')
const selectedLanguage = ref('ja')

function handleCreateCollection() {
  if (!newCollectionName.value.trim()) return
  const collection = libraryStore.createCollection(newCollectionName.value, selectedLanguage.value)
  showCreateModal.value = false
  newCollectionName.value = ''
  router.push(`/library/${collection.id}`)
}
</script>

<template>
  <div class="min-h-screen" :class="songStore.darkMode ? 'dark' : ''">
    <div class="min-h-screen bg-white dark:bg-gray-900 transition-colors">
      <div class="max-w-7xl mx-auto px-6 py-8">
        <div class="flex items-center justify-between mb-8">
          <div>
            <h1 class="text-4xl font-bold text-gray-800 dark:text-gray-200">LangSlice</h1>
            <p class="text-gray-500 dark:text-gray-400 mt-2">Your language learning library</p>
          </div>

          <button
            class="p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Toggle dark mode"
            @click="songStore.toggleDarkMode()"
          >
            <Moon v-if="!songStore.darkMode" class="text-gray-600" :size="24" />
            <Sun v-else class="text-gray-400" :size="24" />
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <button
            class="h-48 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl flex flex-col items-center justify-center gap-3 hover:border-[#58CC02] dark:hover:border-[#45A002] hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
            @click="showCreateModal = true"
          >
            <Plus class="text-gray-400" :size="48" />
            <span class="text-gray-500 dark:text-gray-400 font-medium">New Collection</span>
          </button>

          <NuxtLink
            v-for="collection in libraryStore.collections"
            :key="collection.id"
            :to="`/library/${collection.id}`"
            class="h-48 bg-gradient-to-br from-[#58CC02] to-[#45A002] rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all transform hover:scale-105 flex flex-col justify-between"
          >
            <div>
              <h3 class="text-2xl font-bold text-white mb-2">{{ collection.name }}</h3>
              <p class="text-white/80 text-sm">{{ collection.songCount }} songs</p>
            </div>
            <div class="flex items-center gap-2 text-white/80">
              <Music :size="16" />
              <span class="text-sm uppercase tracking-wide">{{ collection.language }}</span>
            </div>
          </NuxtLink>
        </div>

        <div v-if="libraryStore.collections.length === 0" class="text-center py-16">
          <Music class="mx-auto text-gray-300 dark:text-gray-700 mb-4" :size="64" />
          <p class="text-gray-500 dark:text-gray-400 text-lg">Create your first collection to get started</p>
        </div>
      </div>

      <div v-if="showCreateModal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" @click.self="showCreateModal = false">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
          <h2 class="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-4">New Collection</h2>

          <input
            v-model="newCollectionName"
            type="text"
            placeholder="Collection name"
            autofocus
            class="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-lg mb-4 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:border-[#58CC02] dark:focus:border-[#45A002]"
            @keypress.enter="handleCreateCollection"
          />

          <select
            v-model="selectedLanguage"
            class="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-lg mb-6 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:border-[#58CC02] dark:focus:border-[#45A002]"
          >
            <option value="ja">Japanese (日本語)</option>
            <option value="es">Spanish (Español)</option>
            <option value="ko">Korean (한국어)</option>
            <option value="zh">Chinese (中文)</option>
            <option value="fr">French (Français)</option>
            <option value="de">German (Deutsch)</option>
          </select>

          <div class="flex gap-3">
            <button
              class="flex-1 px-4 py-3 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              @click="showCreateModal = false"
            >
              Cancel
            </button>
            <button
              :disabled="!newCollectionName.trim()"
              class="flex-1 px-4 py-3 bg-[#58CC02] text-white rounded-lg font-medium hover:bg-[#4CAF00] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              @click="handleCreateCollection"
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
