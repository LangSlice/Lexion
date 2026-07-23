import { defineStore } from 'pinia'

export interface PlayerControls {
  play: () => void
  pause: () => void
  togglePlay: () => void
  seekTo: (timeSeconds: number) => void
  previousLine: () => void
  nextLine: () => void
  reset: () => void
}

export const usePlayerControlsStore = defineStore('playerControls', {
  state: () => ({
    controls: null as PlayerControls | null,
  }),

  actions: {
    setControls(controls: PlayerControls | null) {
      this.controls = controls
    },
  },
})
