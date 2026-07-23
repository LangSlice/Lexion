/**
 * Portable course.json export/import — knowledge only, never the source media.
 */
import type { SongMetadata, Lyrics } from '~/types/song'
import { apiFetch } from '~/services/apiClient'

export interface MediaReferenceExport {
  kind: string
  youtube_id: string
  spotify_id: string
}

export interface CourseExport {
  format_version: number
  metadata: SongMetadata
  media_reference: MediaReferenceExport
  lyrics: Lyrics
  redacted_licensed_text: boolean
  exported_at: string
}

export async function exportCourse(songId: string): Promise<Blob> {
  const course = await apiFetch<CourseExport>(`/songs/${songId}/export`)
  return new Blob([JSON.stringify(course, null, 2)], { type: 'application/json' })
}

export async function importCourse(file: File): Promise<string> {
  const course: CourseExport = JSON.parse(await file.text())
  const result = await apiFetch<{ songId: string }>('/songs/import', {
    method: 'POST',
    body: { course },
  })
  return result.songId
}
