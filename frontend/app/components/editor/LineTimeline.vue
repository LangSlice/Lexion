<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSongStore } from '~/stores/song'
import { usePlayerControlsStore } from '~/stores/playerControls'
import type { LyricLine } from '~/types/song'

const MIN_DURATION_MS = 300
const DEFAULT_PX_PER_SEC = 90
const DRAG_THRESHOLD_PX = 3

type DragMode = 'move' | 'start' | 'end'

interface DragState {
  lineId: number
  mode: DragMode
  startClientX: number
  origStart: number
  origEnd: number
  moved: boolean
}

const songStore = useSongStore()
const playerControlsStore = usePlayerControlsStore()

const pxPerSec = ref(DEFAULT_PX_PER_SEC)
const drag = ref<DragState | null>(null)
const dragPreview = ref<{ lineId: number; start: number; end: number } | null>(null)
const scrubbing = ref(false)

const lines = computed(() => songStore.song?.lyrics.lines ?? [])
const durationMs = computed(() => songStore.song?.metadata.duration_ms ?? 0)
const trackWidthPx = computed(() => msToPx(durationMs.value))
const playheadPx = computed(() => msToPx(songStore.currentTime))

// Ruler tick spacing scales with zoom, same thresholds as the subtitler reference.
const rulerStepSec = computed(() => {
  if (pxPerSec.value < 24) return 15
  if (pxPerSec.value < 45) return 10
  if (pxPerSec.value < 80) return 5
  if (pxPerSec.value < 140) return 2
  return 1
})

const rulerTicks = computed(() => {
  const stepMs = rulerStepSec.value * 1000
  const ticks: number[] = []
  for (let t = 0; t <= durationMs.value; t += stepMs) ticks.push(t)
  return ticks
})

function msToPx(ms: number) {
  return (ms / 1000) * pxPerSec.value
}

function pxToMs(px: number) {
  return (px / pxPerSec.value) * 1000
}

function formatTick(ms: number) {
  const seconds = Math.floor(ms / 1000)
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function displayedTiming(line: LyricLine) {
  if (dragPreview.value && dragPreview.value.lineId === line.id) {
    return { start: dragPreview.value.start, end: dragPreview.value.end }
  }
  return { start: line.start_time_ms, end: line.end_time_ms }
}

function blockStyle(line: LyricLine) {
  const { start, end } = displayedTiming(line)
  return {
    left: `${msToPx(start)}px`,
    width: `${msToPx(Math.max(MIN_DURATION_MS, end - start))}px`,
  }
}

function onBlockPointerDown(event: PointerEvent) {
  const target = event.target as HTMLElement
  const blockEl = target.closest<HTMLElement>('[data-line-id]')
  if (!blockEl) return

  const lineId = Number(blockEl.dataset.lineId)
  const line = lines.value.find((l) => l.id === lineId)
  if (!line) return

  const handle = target.closest<HTMLElement>('[data-edge]')
  event.preventDefault()
  event.stopPropagation()

  drag.value = {
    lineId,
    mode: (handle?.dataset.edge as DragMode) || 'move',
    startClientX: event.clientX,
    origStart: line.start_time_ms,
    origEnd: line.end_time_ms,
    moved: false,
  }
  dragPreview.value = { lineId, start: line.start_time_ms, end: line.end_time_ms }
  blockEl.setPointerCapture(event.pointerId)
}

function onBlockPointerMove(event: PointerEvent) {
  if (!drag.value) return
  const dx = event.clientX - drag.value.startClientX
  if (Math.abs(dx) > DRAG_THRESHOLD_PX) drag.value.moved = true

  const dt = pxToMs(dx)
  const { mode, origStart, origEnd } = drag.value
  const maxMs = durationMs.value
  let nextStart = origStart
  let nextEnd = origEnd

  if (mode === 'move') {
    const duration = origEnd - origStart
    nextStart = Math.min(Math.max(0, origStart + dt), maxMs - duration)
    nextEnd = nextStart + duration
  } else if (mode === 'start') {
    nextStart = Math.max(0, Math.min(origEnd - MIN_DURATION_MS, origStart + dt))
  } else {
    nextEnd = Math.min(maxMs, Math.max(origStart + MIN_DURATION_MS, origEnd + dt))
  }

  dragPreview.value = { lineId: drag.value.lineId, start: nextStart, end: nextEnd }
}

function onBlockPointerUp() {
  if (!drag.value || !dragPreview.value) return
  const { lineId, moved } = drag.value
  const { start, end } = dragPreview.value

  songStore.setLineTiming(lineId, { start_time_ms: start, end_time_ms: end })
  drag.value = null
  dragPreview.value = null

  if (!moved) {
    songStore.selectLine(lineId)
    playerControlsStore.controls?.seekTo(start / 1000)
  }
}

function onTrackPointerDown(event: PointerEvent) {
  const target = event.target as HTMLElement
  if (target.closest('[data-line-id]')) return

  scrubbing.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  scrubToClientX(event.clientX, event.currentTarget as HTMLElement)
}

function onTrackPointerMove(event: PointerEvent) {
  if (!scrubbing.value) return
  scrubToClientX(event.clientX, event.currentTarget as HTMLElement)
}

function endScrub() {
  scrubbing.value = false
}

function scrubToClientX(clientX: number, scrollEl: HTMLElement) {
  const rect = scrollEl.getBoundingClientRect()
  const offsetPx = clientX - rect.left + scrollEl.scrollLeft
  const ms = Math.max(0, Math.min(durationMs.value, pxToMs(offsetPx)))
  playerControlsStore.controls?.seekTo(ms / 1000)
}
</script>

<template>
  <div
    v-if="songStore.song"
    class="flex-shrink-0 border-t-2 border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900"
  >
    <div
      class="relative overflow-x-auto overflow-y-hidden h-24 select-none"
      @pointerdown="onTrackPointerDown"
      @pointermove="onTrackPointerMove"
      @pointerup="endScrub"
      @pointercancel="endScrub"
    >
      <div class="relative h-full" :style="{ width: `${trackWidthPx}px`, minWidth: '100%' }">
        <!-- Ruler -->
        <div class="relative h-5 border-b border-gray-200 dark:border-zinc-800 pointer-events-none">
          <span
            v-for="tick in rulerTicks"
            :key="tick"
            class="absolute top-0 bottom-0 border-l border-gray-200 dark:border-zinc-700 pl-1 text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap"
            :style="{ left: `${msToPx(tick)}px` }"
          >
            {{ formatTick(tick) }}
          </span>
        </div>

        <div
          class="absolute top-0 bottom-0 w-0.5 bg-[#58CC02] dark:bg-[#45A002] z-20 pointer-events-none"
          :style="{ transform: `translateX(${playheadPx}px)` }"
        />

        <div
          class="absolute inset-x-0 top-5 bottom-0 flex items-center"
          @pointerdown="onBlockPointerDown"
          @pointermove="onBlockPointerMove"
          @pointerup="onBlockPointerUp"
          @pointercancel="onBlockPointerUp"
        >
          <div
            v-for="line in lines"
            :key="line.id"
            :data-line-id="line.id"
            class="absolute h-12 rounded-lg border-2 flex items-center px-2 cursor-grab active:cursor-grabbing overflow-hidden"
            :class="
              songStore.selectedLineId === line.id
                ? 'bg-[#58CC02]/20 border-[#58CC02] dark:border-[#45A002]'
                : 'bg-gray-100 dark:bg-zinc-800 border-gray-300 dark:border-zinc-700'
            "
            :style="blockStyle(line)"
          >
            <span
              data-edge="start"
              class="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-black/10 dark:hover:bg-white/10"
            />
            <span class="text-xs font-medium text-gray-700 dark:text-gray-200 truncate pointer-events-none px-1">
              {{ line.text.original }}
            </span>
            <span
              data-edge="end"
              class="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-black/10 dark:hover:bg-white/10"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
