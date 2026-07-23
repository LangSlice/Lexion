<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Languages, Pencil, Check, Keyboard, Mic2, Download } from 'lucide-vue-next'
import { useSongStore } from '~/stores/song'
import { useLibraryStore } from '~/stores/library'
import { useLanguageStore } from '~/stores/language'
import { usePlayerControlsStore } from '~/stores/playerControls'
import { useLyricsPipeline } from '~/composables/useLyricsPipeline'
import { getSongData, updateSong } from '~/services/songApi'
import { exportCourse } from '~/services/courseApi'
import { downloadBlob } from '~/utils/download'
import { getFile, putFile } from '~/services/uploadedAudioStore'
import { hashFile } from '~/utils/fileHash'
import type { LyricsStrategyId } from '~/types/lyricsStrategy'

const route = useRoute()
const router = useRouter()
const songStore = useSongStore()
const libraryStore = useLibraryStore()
const languageStore = useLanguageStore()
const playerControlsStore = usePlayerControlsStore()
const { run: runLyricsPipeline } = useLyricsPipeline()

const isLoading = ref(true)
const needsStrategyPick = ref(false)
const isProcessing = ref(false)
const error = ref<string | null>(null)

const songRef = computed(() => libraryStore.findSongReference(route.params.songId as string))
const hasYoutubeReference = computed(() => !!songRef.value?.song.youtubeId)
const hasUsableAudio = computed(() => !!songRef.value?.song.contentHash)

async function loadProcessedSong(processedSongId: string) {
  const songData = await getSongData(processedSongId)
  songStore.setSong(songData)
}

async function startProcessing(strategyId: LyricsStrategyId, manualLyrics?: string[]) {
  const ref = songRef.value
  if (!ref) return

  needsStrategyPick.value = false
  isProcessing.value = true
  error.value = null

  try {
    const collection = libraryStore.getCollection(ref.collectionId)
    if (!collection) throw new Error('Collection not found')

    let uploadedAudio: { file: File; contentHash: string } | undefined
    if (ref.song.contentHash) {
      const file = await getFile(ref.song.contentHash)
      if (!file) throw new Error('Attached audio file not found in this browser — re-attach it.')
      uploadedAudio = { file, contentHash: ref.song.contentHash }
    }

    const songId = await runLyricsPipeline(strategyId, {
      youtubeId: ref.song.youtubeId,
      uploadedAudio,
      manualLyrics,
      title: ref.song.title,
      artist: ref.song.artist,
      durationMsHint: ref.song.duration_ms,
      sourceLanguage: collection.language,
      targetLanguage: languageStore.targetLanguage,
    })

    await loadProcessedSong(songId)
    libraryStore.markSongAsProcessed(ref.collectionId, ref.albumId, ref.song.id, songId)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to process song'
  } finally {
    isProcessing.value = false
  }
}

const attachAudioInput = ref<HTMLInputElement | null>(null)

function handleAttachAudioClick() {
  attachAudioInput.value?.click()
}

async function handleAttachAudioSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  const ref = songRef.value
  if (!file || !ref) return

  const contentHash = await hashFile(file)
  await putFile(contentHash, file)
  libraryStore.attachAudioToSong(ref.collectionId, ref.albumId, ref.song.id, contentHash, file.name)
  // Re-show the picker now that ASR/Hybrid are unlocked for this song.
  needsStrategyPick.value = true
}

function handlePickManualLyrics(lines: string[]) {
  startProcessing('legacy', lines)
}

async function handleExportCourse() {
  const song = songStore.song
  if (!song) return

  try {
    const blob = await exportCourse(song.metadata.id)
    downloadBlob(blob, `${song.metadata.title || 'course'}.json`)
  } catch (err) {
    alert(err instanceof Error ? err.message : 'Failed to export course')
  }
}

function toggleEditMode() {
  songStore.editMode = !songStore.editMode
  if (!songStore.editMode) songStore.clearSelection()
}

async function saveEdits() {
  const song = songStore.song
  if (!song) return

  try {
    const saved = await updateSong(song.metadata.id, song)
    songStore.setSong(saved)
    songStore.editMode = false
  } catch (err) {
    console.error('Error updating song:', err)
    alert('Failed to save changes. Please try again.')
  }
}

function handleKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement
  const isTyping =
    target.matches('input, textarea, [contenteditable="true"], [contenteditable="true"] *') ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement

  if (e.key === 'Escape') {
    e.preventDefault()
    if (isTyping) {
      target.blur()
    } else if (songStore.editMode) {
      songStore.editMode = false
      songStore.clearSelection()
    } else {
      router.push(`/library/${songRef.value?.collectionId}`)
      playerControlsStore.controls?.pause()
    }
    return
  }

  if (isTyping) return
  if (!songStore.keyboardShortcutsEnabled) return

  const handledKeys = ['r', 'R', 's', 'S', 'a', 'A', 'd', 'D', 'n', 'N', 'ArrowLeft', 'ArrowRight', ' ']
  if (!handledKeys.includes(e.key)) return
  e.preventDefault()

  const controls = playerControlsStore.controls
  switch (e.key) {
    case 'r':
    case 'R':
      controls?.reset()
      break
    case 's':
    case 'S':
    case ' ':
      controls?.togglePlay()
      break
    case 'a':
    case 'A':
    case 'ArrowLeft':
      controls?.previousLine()
      break
    case 'd':
    case 'D':
    case 'ArrowRight':
      controls?.nextLine()
      break
    case 'n':
    case 'N':
      songStore.toggleDarkMode()
      break
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)

  const ref = songRef.value
  if (!ref) {
    error.value = 'Song not found'
    isLoading.value = false
    return
  }

  try {
    if (ref.song.isProcessed && ref.song.processedSongId) {
      await loadProcessedSong(ref.song.processedSongId)
      isLoading.value = false
    } else if (ref.song.youtubeId || ref.song.contentHash) {
      isLoading.value = false
      needsStrategyPick.value = true
    } else {
      throw new Error('Song cannot be processed (no YouTube reference or attached audio file)')
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load song'
    isLoading.value = false
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div :class="songStore.darkMode ? 'dark' : ''">
    <div class="h-screen bg-white dark:bg-zinc-950 flex flex-col transition-colors">
      <div v-if="!isLoading && !needsStrategyPick && !isProcessing && !error" class="h-full flex flex-col max-w-7xl mx-auto w-full">
        <div class="flex-shrink-0 px-4 pt-4 pb-2 flex items-center justify-between gap-2">
          <button
            class="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-[#58CC02] dark:hover:text-[#45A002] transition-colors"
            @click="router.push(`/library/${songRef?.collectionId}`)"
          >
            <ArrowLeft :size="20" />
            <span class="hidden sm:inline">Back to Playlist</span>
          </button>

          <div class="flex items-center gap-1">
            <button
              class="p-2 rounded-lg transition-colors"
              :class="
                songStore.showExplanations
                  ? 'bg-[#58CC02]/20 text-[#58CC02] dark:text-[#45A002]'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800'
              "
              title="Toggle explanations"
              @click="songStore.toggleExplanations()"
            >
              <Languages :size="18" />
            </button>

            <button
              class="p-2 rounded-lg transition-colors"
              :class="
                songStore.wordHighlightEnabled
                  ? 'bg-[#58CC02]/20 text-[#58CC02] dark:text-[#45A002]'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800'
              "
              title="Toggle word-by-word highlight"
              @click="songStore.toggleWordHighlight()"
            >
              <Mic2 :size="18" />
            </button>

            <button
              class="p-2 rounded-lg transition-colors"
              :class="
                songStore.keyboardShortcutsEnabled
                  ? 'bg-[#58CC02]/20 text-[#58CC02] dark:text-[#45A002]'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800'
              "
              title="Toggle keyboard shortcuts"
              @click="songStore.toggleKeyboardShortcuts()"
            >
              <Keyboard :size="18" />
            </button>

            <button
              v-if="songStore.editMode"
              class="p-2 rounded-full bg-green-500 text-white hover:bg-green-600 transition-colors"
              title="Save Changes"
              @click="saveEdits"
            >
              <Check :size="18" />
            </button>

            <button
              class="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
              title="Export course.json (knowledge only, no media)"
              @click="handleExportCourse"
            >
              <Download :size="18" />
            </button>

            <button
              class="p-2 rounded-full transition-colors"
              :class="
                songStore.editMode
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800'
              "
              :title="songStore.editMode ? 'Exit Edit Mode' : 'Edit Lyrics'"
              @click="toggleEditMode"
            >
              <Pencil :size="18" />
            </button>
          </div>
        </div>

        <div class="flex-1 flex flex-col md:flex-row min-h-0">
          <div class="flex-1 min-h-0 md:min-w-0 overflow-y-auto overflow-x-hidden">
            <LyricsDisplay />
          </div>
          <LineWordPanel v-if="songStore.editMode && songStore.selectedLineId !== null" />
        </div>

        <div class="flex-shrink-0 flex flex-col">
          <LineTimeline v-if="songStore.editMode" />
          <SongPlayer />
        </div>
      </div>

      <div v-else-if="isLoading" class="h-full flex flex-col items-center justify-center">
        <div class="animate-spin rounded-full h-16 w-16 border-b-4 border-[#58CC02] dark:border-[#45A002] mb-4" />
        <p class="text-gray-500 dark:text-gray-400 text-lg">Loading...</p>
      </div>

      <div v-else-if="needsStrategyPick" class="h-full flex items-center justify-center">
        <input ref="attachAudioInput" type="file" accept="audio/*,video/*" class="hidden" @change="handleAttachAudioSelected" />
        <LyricsStrategyPicker
          :has-youtube-reference="hasYoutubeReference"
          :has-usable-audio="hasUsableAudio"
          @pick="startProcessing"
          @attach-audio="handleAttachAudioClick"
          @pick-manual="handlePickManualLyrics"
        />
      </div>

      <div v-else-if="isProcessing" class="h-full flex items-center justify-center">
        <ProcessingProgress />
      </div>

      <div v-else-if="error" class="h-full flex flex-col items-center justify-center">
        <div class="text-red-500 text-6xl mb-4">⚠️</div>
        <p class="text-gray-800 dark:text-gray-200 text-xl font-bold mb-2">Error</p>
        <p class="text-gray-500 dark:text-gray-400 mb-6">{{ error }}</p>
        <button
          class="px-6 py-3 bg-[#58CC02] text-white rounded-lg font-medium hover:bg-[#4CAF00] transition-colors"
          @click="router.push(`/library/${songRef?.collectionId || ''}`)"
        >
          Back to Playlist
        </button>
      </div>
    </div>
  </div>
</template>
