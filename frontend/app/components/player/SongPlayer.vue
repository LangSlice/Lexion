<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { useSongStore } from '~/stores/song'
import { usePlayerControlsStore } from '~/stores/playerControls'
import { getFile } from '~/services/uploadedAudioStore'

declare global {
  interface Window {
    YT: any
    onYouTubeIframeAPIReady: () => void
  }
}

const songStore = useSongStore()
const playerControlsStore = usePlayerControlsStore()

// Two mutually-exclusive transports, chosen by media.kind: YouTube's IFrame
// player (playback only — no server-side audio download, see
// backend/app/song_processing/youtube.py) or a native <audio> element pointed
// at the user's own uploaded file (resolved from IndexedDB by content_hash).
let youtubePlayer: any = null
const audioEl = ref<HTMLAudioElement | null>(null)
let audioObjectUrl: string | null = null

const mediaKind = computed(() => songStore.song?.media.kind)
const playerReady = ref(false)
const audioUnavailable = ref(false)
let intervalId: number | null = null
const scrubbing = ref(false)

function initYoutubePlayer() {
  const videoId = songStore.song?.media.youtube_id
  if (!videoId) return

  const div = document.createElement('div')
  div.id = 'yt-player-hidden'
  div.style.display = 'none'
  document.body.appendChild(div)

  youtubePlayer = new window.YT.Player('yt-player-hidden', {
    videoId,
    playerVars: { autoplay: 0 },
    events: {
      onReady: () => {
        playerReady.value = true
      },
      onStateChange: onYoutubeStateChange,
    },
  })
}

function onYoutubeStateChange(event: any) {
  if (event.data === 1) {
    songStore.isPlaying = true
    startTimeTracking()
  } else {
    songStore.isPlaying = false
    stopTimeTracking()
  }
}

async function loadUploadedAudio() {
  audioUnavailable.value = false
  const contentHash = songStore.song?.media.content_hash
  if (!contentHash) {
    audioUnavailable.value = true
    return
  }

  const file = await getFile(contentHash)
  if (!file) {
    audioUnavailable.value = true
    return
  }

  if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl)
  audioObjectUrl = URL.createObjectURL(file)

  // audioEl may not exist yet on first load (v-if renders after this resolves) —
  // the template's :src binding picks it up once mounted; here we just need it
  // set for the case where the element already exists (song-switch).
  if (audioEl.value) audioEl.value.src = audioObjectUrl
  playerReady.value = true
}

function onAudioPlay() {
  songStore.isPlaying = true
  startTimeTracking()
}

function onAudioPause() {
  songStore.isPlaying = false
  stopTimeTracking()
}

function startTimeTracking() {
  if (intervalId) return
  intervalId = window.setInterval(() => {
    songStore.currentTime = getCurrentTimeSeconds() * 1000
  }, 100)
}

function stopTimeTracking() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

function getCurrentTimeSeconds(): number {
  if (mediaKind.value === 'youtube') return youtubePlayer?.getCurrentTime?.() ?? 0
  return audioEl.value?.currentTime ?? 0
}

function playMedia() {
  if (mediaKind.value === 'youtube') youtubePlayer?.playVideo()
  else audioEl.value?.play()
}

function pauseMedia() {
  if (mediaKind.value === 'youtube') youtubePlayer?.pauseVideo()
  else audioEl.value?.pause()
}

function seekToSeconds(seconds: number) {
  if (mediaKind.value === 'youtube') youtubePlayer?.seekTo(seconds, true)
  else if (audioEl.value) audioEl.value.currentTime = seconds
}

function togglePlay() {
  if (!playerReady.value) return
  if (songStore.isPlaying) pauseMedia()
  else playMedia()
}

function seekBackward() {
  if (!playerReady.value) return
  seekToSeconds(Math.max(0, getCurrentTimeSeconds() - 5))
}

function seekForward() {
  if (!playerReady.value) return
  seekToSeconds(getCurrentTimeSeconds() + 5)
}

function seekToClientX(clientX: number, barEl: HTMLElement) {
  if (!playerReady.value) return
  const durationMs = songStore.song?.metadata.duration_ms || 0
  if (durationMs <= 0) return

  const rect = barEl.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  const targetMs = ratio * durationMs

  songStore.currentTime = targetMs
  seekToSeconds(targetMs / 1000)
}

function onProgressPointerDown(event: PointerEvent) {
  if (!playerReady.value) return
  scrubbing.value = true
  const barEl = event.currentTarget as HTMLElement
  barEl.setPointerCapture(event.pointerId)
  seekToClientX(event.clientX, barEl)
}

function onProgressPointerMove(event: PointerEvent) {
  if (!scrubbing.value) return
  seekToClientX(event.clientX, event.currentTarget as HTMLElement)
}

function endProgressScrub() {
  scrubbing.value = false
}

function seekTo(timeSeconds: number) {
  songStore.currentTime = timeSeconds * 1000
  seekToSeconds(timeSeconds)
}

function jumpToPreviousBlock() {
  if (!playerReady.value) return
  const currentIdx = songStore.currentLineIndex
  const lines = songStore.song?.lyrics.lines || []

  if (currentIdx > 0) {
    seekTo(lines[currentIdx - 1].start_time_ms / 1000)
  } else if (currentIdx === 0) {
    seekTo(0)
  }
}

function jumpToNextBlock() {
  if (!playerReady.value) return
  const currentIdx = songStore.currentLineIndex
  const lines = songStore.song?.lyrics.lines || []
  if (currentIdx < lines.length - 1) {
    seekTo(lines[currentIdx + 1].start_time_ms / 1000)
  }
}

function formatTime(ms: number) {
  const seconds = Math.floor(ms / 1000)
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const progress = computed(() => {
  const duration = songStore.song?.metadata.duration_ms || 1
  return (songStore.currentTime / duration) * 100
})

function initForCurrentSong() {
  playerReady.value = false
  audioUnavailable.value = false

  if (mediaKind.value === 'youtube') {
    if (!youtubePlayer) {
      if (window.YT && window.YT.Player) initYoutubePlayer()
      // else: onYouTubeIframeAPIReady (registered in onMounted) will call initYoutubePlayer once the script loads
    } else {
      youtubePlayer.loadVideoById(songStore.song?.media.youtube_id)
      playerReady.value = true
    }
  } else if (mediaKind.value === 'upload') {
    loadUploadedAudio()
  }
}

onMounted(() => {
  if (!window.YT) {
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    const firstScriptTag = document.getElementsByTagName('script')[0]
    firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag)
  }

  window.onYouTubeIframeAPIReady = () => {
    if (mediaKind.value === 'youtube') initYoutubePlayer()
  }

  initForCurrentSong()

  playerControlsStore.setControls({
    play: playMedia,
    pause: pauseMedia,
    togglePlay,
    seekTo,
    previousLine: jumpToPreviousBlock,
    nextLine: jumpToNextBlock,
    reset: () => seekTo(0),
  })
})

watch(() => songStore.song, initForCurrentSong)

onUnmounted(() => {
  stopTimeTracking()
  playerReady.value = false
  youtubePlayer?.destroy()
  if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl)
  playerControlsStore.setControls(null)
})
</script>

<template>
  <div class="bg-white dark:bg-zinc-900 border-t-2 border-gray-100 dark:border-zinc-800 p-4">
    <audio
      v-if="mediaKind === 'upload'"
      ref="audioEl"
      :src="audioObjectUrl ?? undefined"
      style="display: none"
      @play="onAudioPlay"
      @pause="onAudioPause"
    />

    <div v-if="songStore.song" class="text-center mb-3">
      <h3 class="text-sm font-bold text-gray-800 dark:text-gray-200">{{ songStore.song.metadata.title }}</h3>
      <p class="text-xs text-gray-500 dark:text-gray-400">{{ songStore.song.metadata.artist }}</p>
    </div>

    <div v-if="audioUnavailable" class="text-center py-3 mb-3 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
      Audio unavailable — attach the original file to this song to play it back.
    </div>

    <div class="mb-4">
      <div
        class="relative py-2 -my-2 cursor-pointer group touch-none select-none"
        @pointerdown="onProgressPointerDown"
        @pointermove="onProgressPointerMove"
        @pointerup="endProgressScrub"
        @pointercancel="endProgressScrub"
      >
        <div class="h-2 bg-gray-200 dark:bg-zinc-800 rounded-full overflow-hidden pointer-events-none">
          <div
            class="h-full bg-[#58CC02] dark:bg-[#45A002]"
            :class="scrubbing ? '' : 'transition-[width] duration-100'"
            :style="{ width: `${progress}%` }"
          />
        </div>
        <div
          class="absolute top-1/2 w-3.5 h-3.5 rounded-full bg-[#58CC02] dark:bg-[#45A002] border-2 border-white dark:border-zinc-900 shadow -translate-y-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity"
          :class="{ 'opacity-100': scrubbing }"
          :style="{ left: `${progress}%` }"
        />
      </div>
      <div class="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
        <span>{{ formatTime(songStore.currentTime) }}</span>
        <span>{{ formatTime(songStore.song?.metadata.duration_ms || 0) }}</span>
      </div>
    </div>

    <div class="flex items-center justify-center gap-2">
      <button class="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors" title="Retroceder 5s" @click="seekBackward">
        <ChevronLeft :size="20" class="text-gray-700 dark:text-gray-300" />
      </button>

      <button
        class="p-2 hover:bg-[#58CC02] dark:hover:bg-[#45A002] hover:text-white rounded-lg transition-all"
        title="Bloque anterior"
        @click="jumpToPreviousBlock"
      >
        <SkipBack :size="24" class="text-gray-700 dark:text-gray-300 transition-colors" />
      </button>

      <button
        class="p-4 bg-[#58CC02] dark:bg-[#45A002] hover:bg-[#4CAF00] dark:hover:bg-[#3A8F00] rounded-full shadow-lg transition-all mx-2"
        :title="songStore.isPlaying ? 'Pausar' : 'Reproducir'"
        @click="togglePlay"
      >
        <Play v-if="!songStore.isPlaying" :size="32" class="text-white" fill="white" />
        <Pause v-else :size="32" class="text-white" fill="white" />
      </button>

      <button
        class="p-2 hover:bg-[#58CC02] dark:hover:bg-[#45A002] hover:text-white rounded-lg transition-all"
        title="Siguiente bloque"
        @click="jumpToNextBlock"
      >
        <SkipForward :size="24" class="text-gray-700 dark:text-gray-300 transition-colors" />
      </button>

      <button class="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors" title="Adelantar 5s" @click="seekForward">
        <ChevronRight :size="20" class="text-gray-700 dark:text-gray-300" />
      </button>
    </div>
  </div>
</template>
