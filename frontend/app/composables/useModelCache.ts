/**
 * Introspects and clears the browser Cache API storage that transformers.js
 * uses (env.useBrowserCache = true) to persist downloaded Whisper weights
 * across sessions. This is the "user can erase/clean the cache" affordance.
 */
const TRANSFORMERS_CACHE_NAME_PATTERN = /transformers/i

export function useModelCache() {
  async function getCachedModelBytes(): Promise<number> {
    if (typeof caches === 'undefined') return 0

    const keys = await caches.keys()
    const targetKeys = keys.filter((k) => TRANSFORMERS_CACHE_NAME_PATTERN.test(k))

    let totalBytes = 0
    for (const key of targetKeys) {
      const cache = await caches.open(key)
      const requests = await cache.keys()
      for (const request of requests) {
        const response = await cache.match(request)
        const contentLength = response?.headers.get('content-length')
        if (contentLength) totalBytes += parseInt(contentLength, 10)
      }
    }
    return totalBytes
  }

  async function clearCachedModels(): Promise<void> {
    if (typeof caches === 'undefined') return
    const keys = await caches.keys()
    const targetKeys = keys.filter((k) => TRANSFORMERS_CACHE_NAME_PATTERN.test(k))
    await Promise.all(targetKeys.map((k) => caches.delete(k)))
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    return `${(bytes / 1024 ** exponent).toFixed(1)} ${units[exponent]}`
  }

  return { getCachedModelBytes, clearCachedModels, formatBytes }
}
