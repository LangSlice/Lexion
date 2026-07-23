<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Plus, Play, Mic, ArrowLeft, Search, Trash2, Upload } from 'lucide-vue-next'
import { useLibraryStore } from '~/stores/library'
import { useSongStore } from '~/stores/song'
import { importCourse } from '~/services/courseApi'
import type { SongReference } from '~/types/library'

const GENRE_FILTERS = ['All', 'Chill', 'EDM', 'Pop', 'Folk', 'Indie', 'Classic']

const route = useRoute()
const router = useRouter()
const libraryStore = useLibraryStore()
const songStore = useSongStore()

const collectionId = computed(() => route.params.collectionId as string)
const selectedGenre = ref('All')
const showSearchModal = ref(false)
const importInput = ref<HTMLInputElement | null>(null)
const isImporting = ref(false)

async function handleImportFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file || !album.value) return

  isImporting.value = true
  try {
    const songId = await importCourse(file)
    const parsed = JSON.parse(await file.text())
    const youtubeId: string | undefined = parsed.media_reference?.youtube_id || undefined
    const isUpload = parsed.media_reference?.kind === 'upload'

    const songRef: SongReference = {
      id: crypto.randomUUID(),
      title: parsed.metadata?.title || 'Imported course',
      artist: parsed.metadata?.artist || '',
      thumbnailUrl: youtubeId ? `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg` : '',
      provider: isUpload ? 'upload' : 'youtube',
      youtubeId,
      contentHash: isUpload ? parsed.media_reference?.content_hash || undefined : undefined,
      duration_ms: parsed.metadata?.duration_ms || 0,
      addedAt: Date.now(),
      isProcessed: true,
      processedSongId: songId,
      genre: 'Pop',
    }

    libraryStore.addSongToAlbum(collectionId.value, album.value.id, songRef)

    // The export never bundles media bytes — an imported upload-sourced course
    // has a content_hash but no actual file yet in this browser's IndexedDB.
    if (isUpload) {
      alert('This course was linked to a locally-uploaded file. Attach your own copy of that file to enable playback and re-transcription.')
    }
  } catch (err) {
    alert(err instanceof Error ? err.message : 'Failed to import course.json')
  } finally {
    isImporting.value = false
    if (importInput.value) importInput.value.value = ''
  }
}

const collection = computed(() => libraryStore.getCollection(collectionId.value))

// For simplicity, use first album or create a default one
const album = computed(() => {
  const coll = collection.value
  if (!coll) return null
  if (coll.albums.length === 0) {
    return libraryStore.createAlbum(coll.id, `${coll.name} Playlist`) ?? null
  }
  return coll.albums[0]
})

const filteredSongs = computed(() => {
  const alb = album.value
  if (!alb) return []
  if (selectedGenre.value === 'All') return alb.songReferences
  return alb.songReferences.filter((s) => s.genre === selectedGenre.value)
})

function handlePlayAll() {
  const songs = filteredSongs.value
  if (songs.length > 0) {
    router.push(`/library/${collectionId.value}/song/${songs[0].id}`)
  }
}

function handleDeleteSong(songId: string) {
  if (!album.value) return
  if (confirm('Remove this song from the playlist?')) {
    libraryStore.removeSongFromAlbum(collectionId.value, album.value.id, songId)
  }
}
</script>

<template>
  <div class="min-h-screen" :class="songStore.darkMode ? 'dark' : ''">
    <div class="min-h-screen bg-white dark:bg-gray-900 transition-colors">
      <div class="max-w-7xl mx-auto px-6 py-4">
        <NuxtLink to="/library" class="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-[#58CC02] dark:hover:text-[#45A002] transition-colors">
          <ArrowLeft :size="20" />
          <span>Back to Collections</span>
        </NuxtLink>
      </div>

      <div class="max-w-7xl mx-auto px-6 py-8">
        <template v-if="collection && album">
          <div class="flex items-end gap-6 mb-8">
            <div class="w-48 h-48 bg-gradient-to-br from-[#58CC02] to-[#45A002] rounded-2xl shadow-xl grid grid-cols-2 gap-1 p-1 flex-shrink-0">
              <template v-if="album.coverImages.length > 0">
                <div v-for="img in album.coverImages.slice(0, 4)" :key="img" class="bg-cover bg-center rounded-lg" :style="{ backgroundImage: `url(${img})` }" />
                <div v-for="n in Math.max(0, 4 - album.coverImages.length)" :key="`empty-${n}`" class="bg-white/10 rounded-lg" />
              </template>
              <div v-else class="col-span-2 row-span-2 flex items-center justify-center">
                <Play :size="64" class="text-white/30" />
              </div>
            </div>

            <div class="flex-1">
              <p class="text-sm text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Playlist</p>
              <h1 class="text-5xl font-bold text-gray-800 dark:text-gray-200 mb-4">{{ collection.name }}</h1>
              <p class="text-gray-500 dark:text-gray-400">{{ album.songReferences.length }} songs</p>
            </div>
          </div>

          <div class="flex items-center gap-4 mb-6">
            <button
              :disabled="filteredSongs.length === 0"
              class="w-14 h-14 bg-[#58CC02] dark:bg-[#45A002] rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
              @click="handlePlayAll"
            >
              <Play :size="24" fill="white" class="text-white ml-1" />
            </button>

            <button
              class="px-6 py-3 border-2 border-gray-300 dark:border-gray-700 rounded-full font-medium text-gray-700 dark:text-gray-300 hover:border-[#58CC02] dark:hover:border-[#45A002] flex items-center gap-2 transition-colors"
              @click="showSearchModal = true"
            >
              <Plus :size="20" />
              Add Songs
            </button>

            <button
              :disabled="isImporting"
              class="px-6 py-3 border-2 border-gray-300 dark:border-gray-700 rounded-full font-medium text-gray-700 dark:text-gray-300 hover:border-[#58CC02] dark:hover:border-[#45A002] flex items-center gap-2 transition-colors disabled:opacity-50"
              title="Import a previously exported course.json"
              @click="importInput?.click()"
            >
              <Upload :size="20" />
              {{ isImporting ? 'Importing…' : 'Import course.json' }}
            </button>
            <input ref="importInput" type="file" accept="application/json" class="hidden" @change="handleImportFile" />
          </div>

          <div class="flex gap-2 mb-8 overflow-x-auto pb-2">
            <button
              v-for="genre in GENRE_FILTERS"
              :key="genre"
              class="px-4 py-2 rounded-full font-medium whitespace-nowrap transition-all"
              :class="
                selectedGenre === genre
                  ? 'bg-[#58CC02] dark:bg-[#45A002] text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              "
              @click="selectedGenre = genre"
            >
              {{ genre }}
            </button>
          </div>

          <div class="space-y-2">
            <div
              v-for="(song, index) in filteredSongs"
              :key="song.id"
              class="flex items-center gap-4 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-[#58CC02] dark:hover:border-[#45A002] hover:bg-gray-50 dark:hover:bg-gray-800 group transition-all"
            >
              <span class="text-gray-400 w-6 text-center">{{ index + 1 }}</span>
              <img :src="song.thumbnailUrl" :alt="song.title" class="w-12 h-12 rounded" />

              <div class="flex-1">
                <h3 class="font-medium text-gray-800 dark:text-gray-200">{{ song.title }}</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400">{{ song.artist }}</p>
              </div>

              <span
                class="px-2 py-1 rounded text-xs font-medium"
                :class="{
                  'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300': song.provider === 'youtube',
                  'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300': song.provider === 'spotify',
                  'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300': song.provider === 'upload',
                }"
              >
                {{ song.provider === 'youtube' ? 'YT' : song.provider === 'spotify' ? 'Spotify' : 'FILE' }}
              </span>

              <span v-if="song.isProcessed" class="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">Ready</span>

              <div class="flex gap-2">
                <NuxtLink :to="`/library/${collectionId}/song/${song.id}`" class="p-2 hover:bg-[#58CC02] hover:text-white rounded-full transition-all" title="Play/Learn">
                  <Mic :size="20" class="text-gray-500 dark:text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300" />
                </NuxtLink>
                <button class="p-2 hover:bg-red-500 hover:text-white rounded-full transition-all" title="Remove" @click="handleDeleteSong(song.id)">
                  <Trash2 :size="20" class="text-gray-500 dark:text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300" />
                </button>
              </div>
            </div>

            <div v-if="filteredSongs.length === 0 && album.songReferences.length > 0" class="text-center py-16">
              <Search class="mx-auto text-gray-300 dark:text-gray-700 mb-4" :size="64" />
              <p class="text-gray-500 dark:text-gray-400 text-lg">No {{ selectedGenre }} songs found</p>
              <button class="mt-4 text-[#58CC02] dark:text-[#45A002] hover:underline" @click="selectedGenre = 'All'">Show all songs</button>
            </div>

            <div v-if="album.songReferences.length === 0" class="text-center py-16">
              <Plus class="mx-auto text-gray-300 dark:text-gray-700 mb-4" :size="64" />
              <p class="text-gray-500 dark:text-gray-400 text-lg mb-4">No songs yet. Add some to get started!</p>
              <button class="px-6 py-3 bg-[#58CC02] text-white rounded-lg font-medium hover:bg-[#4CAF00] transition-colors" @click="showSearchModal = true">Add Songs</button>
            </div>
          </div>
        </template>

        <div v-else class="text-center py-16">
          <p class="text-gray-500 dark:text-gray-400 text-lg mb-4">Collection not found</p>
          <NuxtLink to="/library" class="text-[#58CC02] dark:text-[#45A002] hover:underline">Back to Collections</NuxtLink>
        </div>
      </div>

      <SearchModal v-if="showSearchModal && album" :collection-id="collectionId" :album-id="album.id" @close="showSearchModal = false" />
    </div>
  </div>
</template>
