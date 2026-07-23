import { useFeaturesStore } from '~/stores/features'

export default defineNuxtPlugin(() => {
  useFeaturesStore().load()
})
