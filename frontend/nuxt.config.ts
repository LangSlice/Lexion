// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@pinia/nuxt', '@nuxtjs/tailwindcss', '@vueuse/nuxt'],
  ssr: false,
  components: [{ path: '~/components', pathPrefix: false }],
  runtimeConfig: {
    youtubeApiKey: process.env.NUXT_YOUTUBE_API_KEY || '', // server-only, never exposed to the client
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:8000/api'
    }
  }
})