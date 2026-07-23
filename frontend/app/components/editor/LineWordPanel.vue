<script setup lang="ts">
import { computed, ref } from 'vue'
import { Users, Ungroup } from 'lucide-vue-next'
import { useSongStore } from '~/stores/song'
import { useLineGroupedWords } from '~/composables/useLineGroupedWords'

const songStore = useSongStore()

const line = computed(() => songStore.currentSelectedLine)
const runs = computed(() => (line.value ? useLineGroupedWords(line.value) : []))

const groupModeActive = ref(false)
const selectedIndices = ref<number[]>([])
const groupMeaning = ref('')
const groupTranslation = ref('')

function resetGroupSelection() {
  selectedIndices.value = []
  groupMeaning.value = ''
  groupTranslation.value = ''
}

function toggleGroupMode() {
  groupModeActive.value = !groupModeActive.value
  resetGroupSelection()
}

function toggleWordSelection(index: number) {
  const current = selectedIndices.value ?? []
  if (current.includes(index)) {
    selectedIndices.value = current.filter((i) => i !== index)
    return
  }

  const isAdjacent = current.length === 0 || index === current[0]! - 1 || index === current[current.length - 1]! + 1
  selectedIndices.value = isAdjacent ? [...current, index].sort((a, b) => a - b) : [index]
}

function confirmGroup() {
  if (!line.value || selectedIndices.value.length < 2 || !groupMeaning.value.trim()) return

  songStore.groupWords(line.value.id, selectedIndices.value, {
    meaning: groupMeaning.value.trim(),
    translation: groupTranslation.value.trim() || undefined,
  })
  resetGroupSelection()
}

function ungroup(groupId: string) {
  if (!line.value) return
  songStore.ungroupWords(line.value.id, groupId)
}

// --- Drag-and-drop word reordering ---
// Pointer Events only (no HTML5 native drag, poor touch support; no library) — same style as
// LineTimeline.vue's manual drag handling. Rects are snapshotted once at pointerdown, so
// pointermove is pure arithmetic over a small cached array, never a DOM layout read.

interface DragRect {
  index: number
  rect: DOMRect
}

interface DragGhost {
  x: number
  y: number
  width: number
  height: number
  text: string
}

interface DragState {
  oldIndex: number
  axis: 'x' | 'y'
  rects: DragRect[]
  pointerOffsetX: number
  pointerOffsetY: number
  hoverIndex: number | null
  hoverSide: 'before' | 'after' | null
}

const wordListRef = ref<HTMLElement>()
const draggingIndex = ref<number | null>(null)
const dropTargetIndex = ref<number | null>(null)
const dragGhost = ref<DragGhost | null>(null)
let dragState: DragState | null = null

function resetDrag() {
  dragState = null
  draggingIndex.value = null
  dropTargetIndex.value = null
  dragGhost.value = null
}

function onWordPointerDown(event: PointerEvent) {
  if (groupModeActive.value || !wordListRef.value || !line.value) return

  const target = event.target as HTMLElement | null
  const handle = target?.closest('[data-drag-handle]')
  if (!handle) return

  const card = handle.closest<HTMLElement>('[data-word-index]')
  if (!card) return

  const oldIndex = Number(card.dataset.wordIndex)
  if (Number.isNaN(oldIndex)) return

  event.preventDefault()
  event.stopPropagation()

  const cardEls = Array.from(wordListRef.value.querySelectorAll<HTMLElement>('[data-word-index]'))
  const rects: DragRect[] = cardEls.map((el) => ({ index: Number(el.dataset.wordIndex), rect: el.getBoundingClientRect() }))

  const centersX = rects.map((r) => r.rect.left + r.rect.width / 2)
  const centersY = rects.map((r) => r.rect.top + r.rect.height / 2)
  const rangeX = Math.max(...centersX) - Math.min(...centersX)
  const rangeY = Math.max(...centersY) - Math.min(...centersY)

  const cardRect = card.getBoundingClientRect()
  const pointerOffsetX = event.clientX - cardRect.left
  const pointerOffsetY = event.clientY - cardRect.top

  dragState = {
    oldIndex,
    axis: rangeX >= rangeY ? 'x' : 'y',
    rects,
    pointerOffsetX,
    pointerOffsetY,
    hoverIndex: oldIndex,
    hoverSide: null,
  }

  draggingIndex.value = oldIndex
  dropTargetIndex.value = oldIndex
  dragGhost.value = {
    x: event.clientX - pointerOffsetX,
    y: event.clientY - pointerOffsetY,
    width: cardRect.width,
    height: cardRect.height,
    text: line.value.breakdown[oldIndex]?.text ?? '',
  }

  wordListRef.value.setPointerCapture(event.pointerId)
}

function onWordPointerMove(event: PointerEvent) {
  if (!dragState || !dragGhost.value) return

  dragGhost.value = { ...dragGhost.value, x: event.clientX - dragState.pointerOffsetX, y: event.clientY - dragState.pointerOffsetY }

  const { rects, axis } = dragState

  const hit = rects.find(
    (r) =>
      event.clientX >= r.rect.left &&
      event.clientX <= r.rect.right &&
      event.clientY >= r.rect.top &&
      event.clientY <= r.rect.bottom
  )

  let target = hit
  if (!target) {
    let bestDistance = Infinity
    for (const candidate of rects) {
      const cx = candidate.rect.left + candidate.rect.width / 2
      const cy = candidate.rect.top + candidate.rect.height / 2
      const distance = (event.clientX - cx) ** 2 + (event.clientY - cy) ** 2
      if (distance < bestDistance) {
        bestDistance = distance
        target = candidate
      }
    }
  }
  if (!target) return

  const pointerPos = axis === 'x' ? event.clientX : event.clientY
  const targetCenter = axis === 'x' ? target.rect.left + target.rect.width / 2 : target.rect.top + target.rect.height / 2

  dragState.hoverIndex = target.index
  dragState.hoverSide = pointerPos < targetCenter ? 'before' : 'after'
  dropTargetIndex.value = target.index
}

function onWordPointerUp() {
  if (!dragState || !line.value) {
    resetDrag()
    return
  }

  const { oldIndex, hoverIndex, hoverSide } = dragState
  if (hoverIndex !== null && hoverSide) {
    const insertPos = hoverSide === 'before' ? hoverIndex : hoverIndex + 1
    const newIndex = insertPos > oldIndex ? insertPos - 1 : insertPos
    // A tap-and-release that resolves back to the same slot must NOT commit — reorderWords
    // unconditionally voids real per-word timing for the whole line, even a no-op reorder.
    if (newIndex !== oldIndex) songStore.reorderWords(line.value.id, oldIndex, newIndex)
  }

  resetDrag()
}

function onWordPointerCancel() {
  // Deliberately no commit here (unlike LineTimeline's pointercancel, which does commit) —
  // an interrupted gesture's last-known hover target shouldn't silently reorder words.
  resetDrag()
}
</script>

<template>
  <div
    v-if="line"
    class="flex-shrink-0 max-h-40 md:max-h-none md:min-h-0 md:w-80 overflow-y-auto md:overflow-hidden border-t-2 md:border-t-0 md:border-l-2 border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 flex flex-col gap-2"
  >
    <WordCandidatePanel v-if="songStore.selectedWordPath" />
    <template v-else>
    <!-- Line-level fields: compact single row -->
    <div class="flex items-center gap-2 flex-wrap md:flex-shrink-0">
      <span class="text-sm font-bold text-gray-800 dark:text-gray-200 flex-shrink-0">{{ line.text.original }}</span>
      <input
        type="text"
        placeholder="translation"
        :value="line.text.translation"
        class="flex-1 min-w-[8rem] text-xs px-2 py-1 border rounded bg-transparent border-gray-300 dark:border-zinc-700 focus:border-[#58CC02] dark:focus:border-[#45A002] focus:outline-none dark:text-gray-200"
        @input="line.text.translation = ($event.target as HTMLInputElement).value"
      />
      <input
        type="text"
        placeholder="explanation"
        :value="line.text.explanation"
        class="flex-1 min-w-[8rem] text-xs px-2 py-1 border rounded bg-transparent border-gray-300 dark:border-zinc-700 focus:border-[#58CC02] dark:focus:border-[#45A002] focus:outline-none dark:text-gray-200"
        @input="line.text.explanation = ($event.target as HTMLInputElement).value"
      />
    </div>

    <!-- Group-mode toggle -->
    <div class="flex items-center justify-between md:flex-shrink-0">
      <span class="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Words</span>
      <button
        type="button"
        class="p-1 rounded transition-colors"
        :class="groupModeActive ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800'"
        title="Group words into a phrase"
        @click="toggleGroupMode"
      >
        <Users :size="14" />
      </button>
    </div>

    <!-- Inline "create group" form, shown once 2+ adjacent words are selected -->
    <div
      v-if="groupModeActive && selectedIndices.length >= 2"
      class="flex flex-col gap-1 p-2 border border-blue-200 dark:border-blue-900 rounded-lg bg-blue-50 dark:bg-blue-950/30 md:flex-shrink-0"
    >
      <input
        v-model="groupMeaning"
        type="text"
        placeholder="phrase meaning"
        class="text-xs px-2 py-1 border rounded bg-transparent border-blue-300 dark:border-blue-800 focus:outline-none dark:text-gray-200"
      />
      <input
        v-model="groupTranslation"
        type="text"
        placeholder="translation (optional)"
        class="text-xs px-2 py-1 border rounded bg-transparent border-blue-300 dark:border-blue-800 focus:outline-none dark:text-gray-200"
      />
      <button
        type="button"
        class="text-xs font-bold px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
        :disabled="!groupMeaning.trim()"
        @click="confirmGroup"
      >
        Group {{ selectedIndices.length }} words
      </button>
    </div>

    <!-- Word list: horizontal strip on mobile, vertical stacked list on desktop -->
    <div
      ref="wordListRef"
      class="relative flex flex-row md:flex-col gap-1.5 overflow-x-auto md:overflow-x-visible md:overflow-y-auto md:flex-1 md:min-h-0 pb-1"
      @pointerdown="onWordPointerDown"
      @pointermove="onWordPointerMove"
      @pointerup="onWordPointerUp"
      @pointercancel="onWordPointerCancel"
    >
      <template v-for="run in runs" :key="run.type === 'group' ? run.group.id : `w-${run.index}`">
        <div
          v-if="run.type === 'word'"
          :class="[
            groupModeActive ? 'cursor-pointer rounded-lg' : '',
            selectedIndices.includes(run.index) ? 'ring-2 ring-blue-500' : '',
            draggingIndex === run.index ? 'opacity-30 pointer-events-none select-none' : '',
            dropTargetIndex === run.index && draggingIndex !== run.index ? 'ring-2 ring-[#58CC02] dark:ring-[#45A002] rounded-lg' : '',
          ]"
          @click="groupModeActive ? toggleWordSelection(run.index) : undefined"
        >
          <WordNode :word="run.word" :path="[run.index]" :line-id="line.id" editable :drag-disabled="groupModeActive" />
        </div>

        <!-- Existing phrase group: merged super-card -->
        <div v-else class="shrink-0 border-2 border-dashed border-blue-300 dark:border-blue-800 rounded-lg p-1.5 flex flex-col gap-1 md:w-full">
          <div class="flex items-center gap-1">
            <input
              type="text"
              placeholder="phrase meaning"
              :value="run.group.meaning"
              class="flex-1 min-w-0 text-[11px] px-1 py-0.5 border-b bg-transparent border-blue-300 dark:border-blue-800 focus:outline-none dark:text-gray-200"
              @input="songStore.updatePhraseGroup(line.id, run.group.id, { meaning: ($event.target as HTMLInputElement).value })"
            />
            <button
              type="button"
              class="flex-shrink-0 p-0.5 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded transition-colors"
              title="Ungroup"
              @click="ungroup(run.group.id)"
            >
              <Ungroup :size="12" class="text-blue-500" />
            </button>
          </div>
          <input
            type="text"
            placeholder="translation"
            :value="run.group.translation"
            class="text-[11px] px-1 py-0.5 border-b bg-transparent border-blue-300 dark:border-blue-800 focus:outline-none dark:text-gray-400"
            @input="songStore.updatePhraseGroup(line.id, run.group.id, { translation: ($event.target as HTMLInputElement).value })"
          />

          <div class="flex flex-row gap-1">
            <div
              v-for="item in run.words"
              :key="item.index"
              :class="[
                draggingIndex === item.index ? 'opacity-30 pointer-events-none select-none' : '',
                dropTargetIndex === item.index && draggingIndex !== item.index ? 'ring-2 ring-[#58CC02] dark:ring-[#45A002] rounded-lg' : '',
              ]"
            >
              <WordNode :word="item.word" :path="[item.index]" :line-id="line.id" editable :drag-disabled="groupModeActive" />
            </div>
          </div>
        </div>
      </template>

      <!-- Floating "picked up" ghost, follows the pointer during a drag -->
      <div
        v-if="dragGhost"
        class="fixed z-50 pointer-events-none rounded-lg shadow-xl bg-white dark:bg-zinc-900 border-2 border-[#58CC02] dark:border-[#45A002] scale-105 flex items-center justify-center text-sm font-bold text-gray-800 dark:text-gray-200"
        :style="{ left: `${dragGhost.x}px`, top: `${dragGhost.y}px`, width: `${dragGhost.width}px`, height: `${dragGhost.height}px` }"
      >
        {{ dragGhost.text }}
      </div>
    </div>
    </template>
  </div>
</template>
