<script setup lang="ts">
import { useProcessingStore } from '~/stores/processing'

const processingStore = useProcessingStore()

const STAGE_LABELS: Record<string, string> = {
  idle: 'Waiting...',
  'fetching-metadata': 'Fetching metadata',
  'extracting-audio': 'Extracting audio',
  transcribing: 'Transcribing',
  aligning: 'Aligning timing',
  analyzing: 'Analyzing words',
  saving: 'Saving',
  done: 'Done',
  error: 'Error',
}
</script>

<template>
  <div class="max-w-xl mx-auto p-6 text-center">
    <div v-if="processingStore.stage !== 'error'">
      <div class="animate-spin rounded-full h-16 w-16 border-b-4 border-[#58CC02] dark:border-[#45A002] mx-auto mb-4" />
      <p class="text-gray-800 dark:text-gray-200 text-lg font-bold mb-1">{{ STAGE_LABELS[processingStore.stage] }}</p>
      <p v-if="processingStore.message" class="text-gray-500 dark:text-gray-400 text-sm mb-4">{{ processingStore.message }}</p>

      <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div class="h-full bg-[#58CC02] dark:bg-[#45A002] transition-all duration-300" :style="{ width: `${processingStore.percent}%` }" />
      </div>
    </div>

    <div v-else>
      <div class="text-red-500 text-6xl mb-4">⚠️</div>
      <p class="text-gray-800 dark:text-gray-200 text-xl font-bold mb-2">Something went wrong</p>
      <p class="text-gray-500 dark:text-gray-400">{{ processingStore.error }}</p>
    </div>
  </div>
</template>
