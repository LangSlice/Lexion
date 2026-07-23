import { defineStore } from 'pinia'

export interface Character {
  character: string
  transliteration: string
  ttsUrl: string | null
  state: string
  strength: number
  expandedViewId: string | null
}

export interface CharacterGroup {
  title: string
  subtitle: string
  name: string
  characters: Character[][]
}

export interface Alphabet {
  alphabetSessionId: string
  groups: CharacterGroup[]
  explanationListing: unknown | null
  explanationUrl: string | null
}

export interface LanguageData {
  alphabets: Alphabet[]
}

// Vite glob of every `assets/json/{sourceLanguage}-{targetLanguage}.json` alphabet data file, lazy-loaded on demand.
// Physical filenames keep this {lyrics language}-{native language} convention regardless of the JS field names below.
const languageDataModules = import.meta.glob<{ default: LanguageData }>('~/assets/json/*.json')

export const useLanguageStore = defineStore('language', {
  state: () => ({
    // sourceLanguage: the language of the lyrics being learned (e.g. Japanese)
    sourceLanguage: 'ja',
    // targetLanguage: the learner's native language, i.e. the translation output language (e.g. Spanish)
    targetLanguage: 'es',
    languageData: null as LanguageData | null,
    languageDataLoading: false,
  }),

  actions: {
    setSourceLanguage(code: string) {
      this.sourceLanguage = code
      this.fetchLanguageData()
    },

    setTargetLanguage(code: string) {
      this.targetLanguage = code
      this.fetchLanguageData()
    },

    async fetchLanguageData() {
      const key = `/app/assets/json/${this.sourceLanguage}-${this.targetLanguage}.json`
      const loader = languageDataModules[key]
      if (!loader) {
        console.warn(`Language data for ${this.sourceLanguage}-${this.targetLanguage} not found`)
        this.languageData = null
        return
      }

      this.languageDataLoading = true
      try {
        const mod = await loader()
        this.languageData = mod.default
      } catch (error) {
        console.warn(`Failed to load language data for ${this.sourceLanguage}-${this.targetLanguage}`, error)
        this.languageData = null
      } finally {
        this.languageDataLoading = false
      }
    },
  },

  persist: {
    pick: ['sourceLanguage', 'targetLanguage'],
  },
})
