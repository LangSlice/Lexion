<script setup lang="ts">
import { ref } from 'vue'
import { Search, Upload, X } from 'lucide-vue-next'
import { searchYouTube } from '~/services/youtubeSearch'
import { useLibraryStore } from '~/stores/library'
import { hashFile } from '~/utils/fileHash'
import { putFile } from '~/services/uploadedAudioStore'
import type { SongReference, YouTubeSearchResult } from '~/types/library'

const props = defineProps<{ collectionId: string; albumId: string }>()
const emit = defineEmits<{ close: [] }>()

const libraryStore = useLibraryStore()
const query = ref('')
const youtubeResults = ref<YouTubeSearchResult[]>([])
const isSearching = ref(false)

async function handleSearch() {
  if (!query.value.trim()) return
  isSearching.value = true
  youtubeResults.value = await searchYouTube(query.value)
  isSearching.value = false
}

function handleAddSong(result: YouTubeSearchResult) {
  const songRef: SongReference = {
    id: crypto.randomUUID(),
    title: result.title,
    artist: result.artist,
    thumbnailUrl: result.thumbnailUrl,
    provider: 'youtube',
    youtubeId: result.id,
    duration_ms: result.duration_ms,
    addedAt: Date.now(),
    isProcessed: false,
    genre: 'Pop',
  }

  libraryStore.addSongToAlbum(props.collectionId, props.albumId, songRef)
  emit('close')
}

// --- Upload your own file ---
// Transcription requires real audio bytes, and there's no compliant way to get
// those from a YouTube link (see backend/app/song_processing/youtube.py) — the
// user's own file is the only source, read and hashed entirely client-side.
const uploadInput = ref<HTMLInputElement | null>(null)
const uploadFile = ref<File | null>(null)
const uploadTitle = ref('')
const uploadArtist = ref('')
const isUploading = ref(false)

function handleFileSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploadFile.value = file
  if (!uploadTitle.value) uploadTitle.value = file.name.replace(/\.[^/.]+$/, '')
}

async function handleAddUpload() {
  const file = uploadFile.value
  if (!file) return

  isUploading.value = true
  try {
    const contentHash = await hashFile(file)
    await putFile(contentHash, file)

    const songRef: SongReference = {
      id: crypto.randomUUID(),
      title: uploadTitle.value.trim() || file.name,
      artist: uploadArtist.value.trim(),
      thumbnailUrl: '',
      provider: 'upload',
      contentHash,
      uploadedFileName: file.name,
      duration_ms: 0,
      addedAt: Date.now(),
      isProcessed: false,
      genre: 'Pop',
    }

    libraryStore.addSongToAlbum(props.collectionId, props.albumId, songRef)
    emit('close')
  } finally {
    isUploading.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" @click.self="emit('close')">
    <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
      <div class="p-6 border-b border-gray-200 dark:border-gray-700">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-2xl font-bold text-gray-800 dark:text-gray-200">Search Songs</h2>
          <button class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" @click="emit('close')">
            <X :size="24" class="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div class="flex gap-2">
          <input
            v-model="query"
            type="text"
            placeholder="Search for a song..."
            class="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:border-[#58CC02] dark:focus:border-[#45A002]"
            @keypress.enter="handleSearch"
          />
          <button
            :disabled="isSearching || !query.trim()"
            class="px-6 py-3 bg-[#58CC02] text-white rounded-lg font-medium hover:bg-[#4CAF00] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            @click="handleSearch"
          >
            <Search :size="20" />
            <span>Search</span>
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-6">
        <div class="mb-6 p-4 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700">
          <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Upload your own file</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Required for transcription (Whisper) — YouTube links can't be downloaded server-side, so this is the only source of real audio.
          </p>

          <input ref="uploadInput" type="file" accept="audio/*,video/*" class="hidden" @change="handleFileSelected" />

          <button
            class="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg font-medium text-gray-700 dark:text-gray-300 hover:border-[#58CC02] dark:hover:border-[#45A002] flex items-center justify-center gap-2 transition-colors mb-3"
            @click="uploadInput?.click()"
          >
            <Upload :size="18" />
            <span>{{ uploadFile ? uploadFile.name : 'Choose an audio/video file...' }}</span>
          </button>

          <div v-if="uploadFile" class="flex gap-2 mb-3">
            <input
              v-model="uploadTitle"
              type="text"
              placeholder="Title"
              class="flex-1 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 text-sm focus:outline-none focus:border-[#58CC02] dark:focus:border-[#45A002]"
            />
            <input
              v-model="uploadArtist"
              type="text"
              placeholder="Artist (optional)"
              class="flex-1 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 text-sm focus:outline-none focus:border-[#58CC02] dark:focus:border-[#45A002]"
            />
          </div>

          <button
            v-if="uploadFile"
            :disabled="isUploading"
            class="w-full px-4 py-2 bg-[#58CC02] text-white rounded-lg font-medium text-sm hover:bg-[#4CAF00] disabled:opacity-50 transition-colors"
            @click="handleAddUpload"
          >
            {{ isUploading ? 'Adding…' : 'Add to library' }}
          </button>
        </div>

        <div v-if="youtubeResults.length > 0">
          <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">YouTube Results</h3>
          <div class="space-y-2">
            <div
              v-for="result in youtubeResults"
              :key="result.id"
              class="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <img :src="result.thumbnailUrl" :alt="result.title" class="w-12 h-12 rounded" />
              <div class="flex-1">
                <h4 class="font-medium text-gray-800 dark:text-gray-200">{{ result.title }}</h4>
                <p class="text-sm text-gray-500 dark:text-gray-400">{{ result.artist }}</p>
              </div>
              <span class="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">YouTube</span>
              <button
                class="px-4 py-2 bg-[#58CC02] text-white rounded-lg font-medium text-sm hover:bg-[#4CAF00] transition-colors"
                @click="handleAddSong(result)"
              >
                SAVE
              </button>
            </div>
          </div>
        </div>

        <div v-if="!isSearching && youtubeResults.length === 0 && !query.trim()" class="text-center py-16">
          <Search class="mx-auto text-gray-300 dark:text-gray-700 mb-4" :size="64" />
          <p class="text-gray-500 dark:text-gray-400">Search for songs to add to your playlist</p>
        </div>

        <div v-if="isSearching" class="text-center py-16">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-[#58CC02] mx-auto mb-4" />
          <p class="text-gray-500 dark:text-gray-400">Searching...</p>
        </div>

        <div v-if="!isSearching && query.trim() && youtubeResults.length === 0" class="text-center py-16">
          <Search class="mx-auto text-gray-300 dark:text-gray-700 mb-4" :size="64" />
          <p class="text-gray-500 dark:text-gray-400">No results found for "{{ query }}". Try a different search.</p>
        </div>
      </div>
    </div>
  </div>
</template>
