<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useSongStore } from '~/stores/song'

const songStore = useSongStore()

const lines = computed(() => songStore.song?.lyrics.lines || [])
const currentIndex = computed(() => songStore.currentLineIndex)
const scrollContainer = ref<HTMLDivElement>()

watch(currentIndex, async (idx) => {
  if (idx < 0 || !scrollContainer.value) return
  await nextTick()
  const activeCard = scrollContainer.value.children[idx] as HTMLElement | undefined
  activeCard?.scrollIntoView({ behavior: 'smooth', block: 'center' })
})
</script>

<template>
  <div class="h-full flex flex-col mb-2">
    <div class="flex items-center justify-between mb-2 mt-4 px-6">
      <span class="text-xs font-medium text-gray-500 dark:text-gray-400">
        {{ currentIndex + 1 }} / {{ lines.length }}
      </span>
    </div>

    <div ref="scrollContainer" class="flex-1 overflow-y-auto overflow-x-hidden flex flex-col gap-4 px-6 py-8">
      <LyricLine v-for="(line, index) in lines" :key="line.id" :line="line" :is-active="index === currentIndex" />

      <div v-if="lines.length === 0" class="flex-1 flex items-center justify-center">
        <p class="text-gray-400">No lyrics loaded</p>
      </div>
    </div>
  </div>
</template>
