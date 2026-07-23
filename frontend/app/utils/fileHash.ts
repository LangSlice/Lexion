/** SHA-256 hex digest of a File's contents — keys frontend/app/services/uploadedAudioStore.ts. */
export async function hashFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** File extension (no dot), used to name ffmpeg's input so it can sniff the container format. */
export function fileExtension(filename: string): string {
  const parts = filename.split('.')
  return parts.length > 1 ? parts.pop()! : 'mp4'
}
