<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Play } from 'lucide-vue-next'
import { useSongStore } from '~/stores/song'
import { usePlayerControlsStore } from '~/stores/playerControls'
import { useLineGroupedWords } from '~/composables/useLineGroupedWords'
import type { LyricLine } from '~/types/song'

const props = defineProps<{
  line: LyricLine
  isActive: boolean
}>()

const songStore = useSongStore()
const playerControlsStore = usePlayerControlsStore()

const hasWordBreakdown = computed(() => props.line.breakdown && props.line.breakdown.length > 0)
const isSelected = computed(() => songStore.selectedLineId === props.line.id)
const groupedRuns = computed(() => useLineGroupedWords(props.line))

const wordHighlightActive = computed(() => props.isActive && songStore.wordHighlightEnabled)

function wordStateFor(index: number): 'upcoming' | 'current' | 'spoken' {
  if (!wordHighlightActive.value) return 'upcoming'
  const current = songStore.currentWordIndex
  if (current < 0 || index > current) return 'upcoming'
  return index === current ? 'current' : 'spoken'
}

function handleLineClick() {
  if (songStore.editMode) songStore.selectLine(props.line.id)
}

function handlePlayClick(event: MouseEvent) {
  event.stopPropagation()
  playerControlsStore.controls?.seekTo(props.line.start_time_ms / 1000)
}

function formatTime(ms: number) {
  const seconds = Math.floor(ms / 1000)
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
</script>

<template>
  <div
    class="rounded-xl px-8 pt-10 pb-8 transition-all duration-300 border-2 w-full"
    :class="[
      isActive
        ? 'bg-[#58CC02] dark:bg-[#45A002] border-[#58CC02] dark:border-[#45A002] scale-[1.02] shadow-xl active-line text-white'
        : 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 shadow-md text-gray-800 dark:text-gray-200',
      songStore.editMode && isSelected ? 'ring-2 ring-[#58CC02] dark:ring-[#45A002]' : '',
      songStore.editMode ? 'cursor-pointer' : '',
    ]"
    @click="handleLineClick"
  >
    <div class="flex flex-col gap-3 w-full">
      <!-- Timestamp header -->
      <div class="flex items-center gap-2 pb-2 mb-2 border-b border-gray-200 dark:border-zinc-800">
        <button
          type="button"
          class="flex-shrink-0 p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          :class="isActive ? 'text-white' : 'text-gray-500 dark:text-gray-400'"
          title="Play from here"
          @click="handlePlayClick"
        >
          <Play :size="12" fill="currentColor" />
        </button>
        <span
          class="text-xs font-mono px-1.5 py-0.5 rounded"
          :class="isActive ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400'"
        >
          {{ formatTime(line.start_time_ms) }}
        </span>
        <span :class="isActive ? 'text-white/70' : 'text-gray-400 dark:text-gray-500'">→</span>
        <span
          class="text-xs font-mono px-1.5 py-0.5 rounded"
          :class="isActive ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400'"
        >
          {{ formatTime(line.end_time_ms) }}
        </span>
      </div>

      <!-- Words -->
      <p
        v-if="!hasWordBreakdown"
        class="font-bold transition-all duration-300"
        :class="isActive ? 'text-3xl text-white' : 'text-2xl text-gray-800 dark:text-gray-200'"
      >
        {{ line.text.original }}
      </p>
      <div
        v-else
        class="flex flex-wrap items-end gap-2 font-bold transition-all duration-300"
        :class="isActive ? 'text-3xl text-white' : 'text-2xl text-gray-800 dark:text-gray-200'"
      >
        <template v-for="run in groupedRuns" :key="run.type === 'group' ? run.group.id : `w-${run.index}`">
          <WordNode
            v-if="run.type === 'word'"
            :word="run.word"
            :path="[run.index]"
            :line-id="line.id"
            :is-active="isActive"
            :word-state="wordStateFor(run.index)"
            :selectable="songStore.editMode"
          />

          <!-- Phrase group: bracket the member words with a combined meaning caption -->
          <div v-else class="flex flex-col items-center gap-0.5">
            <div
              class="flex items-end gap-1 pb-1 border-b-2 border-dashed"
              :class="isActive ? 'border-white/50' : 'border-gray-400 dark:border-zinc-600'"
            >
              <WordNode
                v-for="item in run.words"
                :key="item.index"
                :word="item.word"
                :path="[item.index]"
                :line-id="line.id"
                :is-active="isActive"
                :word-state="wordStateFor(item.index)"
                :selectable="songStore.editMode"
              />
            </div>
            <span
              class="text-xs font-medium not-italic"
              :class="isActive ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'"
            >
              {{ run.group.meaning }}
            </span>
          </div>
        </template>

        <button
          v-if="songStore.editMode"
          class="inline-flex items-center justify-center w-12 h-16 border-2 border-dashed border-gray-400 dark:border-gray-500 rounded-lg hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
          title="Add word"
          @click="songStore.addWordToLine(line.id)"
        >
          <Plus :size="20" class="text-gray-500 dark:text-gray-400" />
        </button>
      </div>

      <!-- Explanation / translation -->
      <p
        v-if="songStore.showExplanations"
        class="text-base font-medium"
        :class="isActive ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'"
      >
        {{ line.text.explanation || line.text.translation }}
      </p>
    </div>
  </div>
</template>
