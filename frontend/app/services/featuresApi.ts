/**
 * Feature-flag API service — reflects backend env-var gated features at boot.
 */
function apiBase(): string {
  return useRuntimeConfig().public.apiBase
}

export interface Features {
  legacy_lyrics_enabled: boolean
}

export async function getFeatures(): Promise<Features> {
  return $fetch<Features>(`${apiBase()}/features`)
}
