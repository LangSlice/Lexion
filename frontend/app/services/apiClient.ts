/**
 * Thin $fetch wrapper that injects the owner-token header — use for any call
 * that creates or reads/writes a stored course. Endpoints that are stateless
 * (analyze, lyrics/fetch, youtube metadata/audio) don't need this.
 */
import { getOwnerToken } from '~/utils/ownerToken'

function apiBase(): string {
  return useRuntimeConfig().public.apiBase
}

export function apiFetch<T>(path: string, opts: Record<string, any> = {}): Promise<T> {
  // Cast away Nuxt's typed-route inference for $fetch — with a dynamic URL and
  // a spread `opts` (method type no longer a literal), it tries to match every
  // known Nitro route and blows the TS compiler's recursion limit. Resolved
  // lazily inside the function (not a module-level const) so importing this
  // file doesn't eagerly touch the $fetch auto-import outside a Nuxt runtime.
  const rawFetch = $fetch as unknown as (url: string, opts?: Record<string, any>) => Promise<any>
  return rawFetch(`${apiBase()}${path}`, {
    ...opts,
    headers: { 'X-Owner-Token': getOwnerToken(), ...(opts.headers as Record<string, string> | undefined) },
  })
}
