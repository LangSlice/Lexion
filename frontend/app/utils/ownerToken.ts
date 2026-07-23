/**
 * Opaque per-client token scoping course reads/writes server-side — not a
 * login system, just prevents a stranger who obtains/guesses a song_id from
 * reading or overwriting someone else's course. See backend get_owner_token.
 */
const STORAGE_KEY = 'langslice_owner_token'

export function getOwnerToken(): string {
  let token = localStorage.getItem(STORAGE_KEY)
  if (!token) {
    token = crypto.randomUUID()
    localStorage.setItem(STORAGE_KEY, token)
  }
  return token
}
