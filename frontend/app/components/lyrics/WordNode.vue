<script setup lang="ts">
import { ref } from 'vue'
import { Trash2, Plus, Group, Ungroup, GripVertical, ListTree } from 'lucide-vue-next'
import { useSongStore } from '~/stores/song'
import type { WordBreakdown } from '~/types/song'

defineOptions({ name: 'WordNode' })

const SCRIPT_BADGE_LABEL: Record<WordBreakdown['script_type'], string> = {
  kanji: '漢',
  hiragana: 'ひ',
  katakana: 'カ',
  english: 'EN',
}

const props = withDefaults(
  defineProps<{
    word: WordBreakdown
    /** Index route from the line's breakdown root, e.g. [2] or [2, 0] for a sub_word. */
    path: number[]
    lineId: number
    /** Playback highlight — read-only mode only. */
    isActive?: boolean
    /** Word-level karaoke state, only meaningful while isActive. Sub_words inherit their parent's. */
    wordState?: 'upcoming' | 'current' | 'spoken'
    /** Renders editable fields + a mutation toolbar (used by LineWordPanel). */
    editable?: boolean
    /** Click selects the line and hover tooltip is suppressed (used by LyricLine while songStore.editMode is on). */
    selectable?: boolean
    /** Hides the drag handle even at depth 0 (used by LineWordPanel while its group-mode is active). */
    dragDisabled?: boolean
    depth?: number
  }>(),
  { isActive: false, wordState: 'upcoming', editable: false, selectable: false, dragDisabled: false, depth: 0 }
)

const songStore = useSongStore()

const isHovered = ref(false)
const bubblePosition = ref<'left' | 'center' | 'right'>('center')
const wordRef = ref<HTMLDivElement>()

function handleMouseEnter() {
  isHovered.value = true
  if (!wordRef.value) return

  const rect = wordRef.value.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const wordCenter = rect.left + rect.width / 2
  const leftThird = viewportWidth / 3
  const rightThird = (viewportWidth * 2) / 3

  if (wordCenter < leftThird) bubblePosition.value = 'left'
  else if (wordCenter > rightThird) bubblePosition.value = 'right'
  else bubblePosition.value = 'center'
}

function handleWordClick() {
  if (props.selectable) songStore.selectLine(props.lineId)
}

function handleFieldUpdate(updates: Partial<WordBreakdown>) {
  songStore.updateWordAtPath(props.lineId, props.path, updates)
}

function handleDelete() {
  songStore.deleteWordAtPath(props.lineId, props.path)
}

function handleAddSubWord() {
  songStore.addSubWord(props.lineId, props.path)
}

function handleToggleCompound() {
  songStore.toggleCompound(props.lineId, props.path)
}

function handleOpenCandidates() {
  songStore.selectWord(props.path)
}
</script>

<template>
  <span class="inline-block relative" :class="editable ? '' : 'mx-2'">
    <div
      ref="wordRef"
      :data-word-index="depth === 0 ? path[0] : undefined"
      :class="[
        word.is_compound ? 'flex flex-col items-start' : '',
        selectable ? 'cursor-pointer' : '',
        editable ? 'shrink-0 border border-gray-200 dark:border-zinc-700 rounded-lg p-1.5' : '',
        editable && !word.is_compound ? 'w-28 md:w-full' : '',
        editable && word.is_compound ? 'min-w-[8rem] md:w-full' : '',
      ]"
      @mouseenter="handleMouseEnter"
      @mouseleave="isHovered = false"
      @click="handleWordClick"
    >
      <!-- Read-only simple word -->
      <WordDisplay
        v-if="!word.is_compound && !editable"
        :text="word.text"
        :reading="word.reading"
        :transliteration="word.transliteration"
        :script-type="word.script_type"
        :is-active="isActive"
        :word-state="wordState"
      />

      <!-- Editable simple word -->
      <div v-else-if="!word.is_compound" class="flex items-start gap-1">
        <span
          class="flex-shrink-0 flex items-center justify-center font-bold rounded bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300"
          :class="depth > 0 ? 'w-4 h-4 text-[9px]' : 'w-5 h-5 text-[10px]'"
        >
          {{ SCRIPT_BADGE_LABEL[word.script_type] }}
        </span>

        <WordEditFields :word="word" :compact="depth > 0" @update="handleFieldUpdate" />

        <div class="flex-shrink-0 flex flex-col gap-0.5">
          <button
            v-if="depth === 0 && !dragDisabled"
            type="button"
            data-drag-handle
            class="p-0.5 rounded transition-colors text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-grab active:cursor-grabbing touch-none"
            title="Drag to reorder"
          >
            <GripVertical :size="12" />
          </button>
          <button
            v-if="word.kanji_candidates?.length"
            type="button"
            class="p-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded transition-colors"
            title="Choose kanji spelling"
            @click.stop="handleOpenCandidates"
          >
            <ListTree :size="depth > 0 ? 10 : 12" class="text-amber-500" />
          </button>
          <button
            type="button"
            class="p-0.5 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded transition-colors"
            title="Group into compound word"
            @click="handleToggleCompound"
          >
            <Group :size="depth > 0 ? 10 : 12" class="text-blue-500" />
          </button>
          <button
            type="button"
            class="p-0.5 hover:bg-red-100 dark:hover:bg-red-900/50 rounded transition-colors"
            title="Delete word"
            @click="handleDelete"
          >
            <Trash2 :size="depth > 0 ? 10 : 12" class="text-red-500" />
          </button>
        </div>
      </div>

      <!-- Compound word: read-only breakdown is backend-derived; editable breakdown is manually curated -->
      <div v-else class="flex flex-col gap-2 w-full">
        <div class="flex items-center gap-1 pb-2 border-b border-gray-300 dark:border-zinc-700">
          <span class="text-sm text-gray-600 dark:text-gray-400 flex-1">{{ word.text }}</span>
          <template v-if="editable">
            <button
              v-if="depth === 0 && !dragDisabled"
              type="button"
              data-drag-handle
              class="p-0.5 rounded transition-colors text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-grab active:cursor-grabbing touch-none"
              title="Drag to reorder"
            >
              <GripVertical :size="12" />
            </button>
            <button type="button" class="p-0.5 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded transition-colors" title="Add sub-word" @click="handleAddSubWord">
              <Plus :size="12" class="text-gray-500" />
            </button>
            <button type="button" class="p-0.5 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded transition-colors" title="Ungroup" @click="handleToggleCompound">
              <Ungroup :size="12" class="text-blue-500" />
            </button>
            <button type="button" class="p-0.5 hover:bg-red-100 dark:hover:bg-red-900/50 rounded transition-colors" title="Delete word" @click="handleDelete">
              <Trash2 :size="12" class="text-red-500" />
            </button>
          </template>
        </div>

        <div class="flex gap-1" :class="editable ? 'flex-row' : 'flex-wrap'">
          <div v-for="(subWord, index) in word.sub_words" :key="index" :class="editable ? '' : 'scale-90'">
            <WordNode
              :word="subWord"
              :path="[...path, index]"
              :line-id="lineId"
              :is-active="isActive"
              :word-state="wordState"
              :editable="editable"
              :selectable="selectable"
              :drag-disabled="dragDisabled"
              :depth="depth + 1"
            />
          </div>
        </div>
      </div>

      <!-- Hover bubble: meanings only, read-only display -->
      <div
        v-if="isHovered && !editable && !selectable"
        class="absolute bottom-full mb-3 z-50"
        :class="bubblePosition === 'left' ? 'left-0' : bubblePosition === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'"
      >
        <div
          class="absolute top-full w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-white"
          :class="bubblePosition === 'left' ? 'left-4' : bubblePosition === 'right' ? 'right-4' : 'left-1/2 -translate-x-1/2'"
        />
        <div class="bg-white dark:bg-zinc-900 border-2 border-gray-200 dark:border-zinc-700 rounded-lg shadow-xl px-4 py-2 min-w-max">
          <div v-if="word.context" class="text-xs text-gray-500 dark:text-gray-400 italic mb-1 text-center">
            ({{ word.context }})
          </div>
          <div class="flex items-center gap-2">
            <template v-for="(meaning, index) in word.meanings" :key="index">
              <span class="text-sm text-gray-800 dark:text-gray-200 font-medium whitespace-nowrap">{{ meaning }}</span>
              <span v-if="index < word.meanings.length - 1" class="text-gray-300 dark:text-gray-600 text-sm">|</span>
            </template>
          </div>
        </div>
      </div>
    </div>
  </span>
</template>
