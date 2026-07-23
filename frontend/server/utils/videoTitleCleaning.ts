/**
 * Title/artist cleaning heuristics for YouTube video metadata — TypeScript mirror of
 * backend/app/song_processing/title_cleaning.py (same rules, kept in sync by hand
 * since one lives in the Nitro server runtime and the other in the Python backend).
 *
 * YouTube search results give us `snippet.title` (raw video title) and
 * `snippet.channelTitle` (the uploader, not the real artist) — this cleans both
 * before they're stored/searched, so a lyric video titled e.g.
 * "YOASOBI「祝福」Official Music Video (anime OP note)" uploaded by some reuploader
 * channel resolves to title="祝福", artist="YOASOBI" instead of the raw mess.
 */

const JUNK_PHRASES = [
  /official\s+music\s+video/gi,
  /official\s+lyric\s+video/gi,
  /official\s+video/gi,
  /official\s+audio/gi,
  /lyric\s+video/gi,
  /lyrics\s+video/gi,
  /music\s+video/gi,
  /full\s+version/gi,
  /full\s+ver\.?/gi,
  /\bmv\b/gi,
  /\blyrics\b/gi,
  /\bofficial\b/gi,
  /\bhd\b/gi,
  /\b4k\b/gi,
  /kan[/_ ]?rom[/_ ]?eng/gi,
  /romaji[/_ ]?kanji[/_ ]?english/gi,
  /vietsub/gi,
  /eng\s*sub/gi,
]

const ARTIST_SUFFIXES = [
  /\s*Official\s*Channel\s*$/i,
  /\s*-\s*Topic\s*$/i,
  /\s*VEVO\s*$/i,
  /\s*Official\s*$/i,
  /\s*Music\s*$/i,
]

/** Delimiters separating "Artist" from "Title" in a flat (non-bracketed) title, tried in order. */
const ARTIST_TITLE_DELIMITERS = [' - ', ' / ', '／', ' | ', ': ']

/**
 * Bracket pairs used to directly quote a song title in Japanese MV titles, tried in
 * order — 「」 almost always wraps the song title itself, 『』 more often wraps an
 * enclosing work's title (an anime, film, album), so it's the weaker second guess.
 */
const TITLE_BRACKETS: [string, string][] = [
  ['「', '」'],
  ['『', '』'],
]

/** A trailing (...)/[...]/【...】 block — annotations/translations tacked onto the end. */
const TRAILING_BRACKET_CHAIN = /\s*[([【][^()[\]【】]*[)\]】]\s*$/

function stripJunkPhrases(text: string): string {
  let cleaned = text
  for (const pattern of JUNK_PHRASES) cleaned = cleaned.replace(pattern, ' ')
  return cleaned.replace(/\s{2,}/g, ' ').trim()
}

function stripTrailingBracketChain(text: string): string {
  let current = text
  for (;;) {
    const stripped = current.replace(TRAILING_BRACKET_CHAIN, '').trim()
    if (stripped === current) return current
    current = stripped
  }
}

function extractBracketedTitle(title: string): { prefix: string; title: string } | undefined {
  for (const [openB, closeB] of TITLE_BRACKETS) {
    const start = title.indexOf(openB)
    const end = start !== -1 ? title.indexOf(closeB, start + 1) : -1
    if (start !== -1 && end !== -1) {
      return { prefix: title.slice(0, start).trim(), title: title.slice(start + 1, end).trim() }
    }
  }
  return undefined
}

/** Strips common YouTube channel-name suffixes ('- Topic', 'VEVO', 'Official Channel', ...). */
export function cleanArtistName(artist: string): string {
  if (!artist) return artist
  let cleaned = artist
  for (const pattern of ARTIST_SUFFIXES) cleaned = cleaned.replace(pattern, '')
  return cleaned.trim()
}

/**
 * Best-effort extraction of {title, artist} from a raw YouTube video title, given an
 * optional artist hint (typically the channel/uploader name). The hint is used as a
 * fallback only — when the title itself contains a clear artist/title split (a
 * delimiter, or a quoted-title bracket), that wins, since the hint is often just
 * whoever reuploaded the video rather than the real performing artist.
 */
export function cleanTitleArtist(rawTitle: string, artistHint = ''): { title: string; artist: string } {
  let title = rawTitle || ''
  let artist = (artistHint || '').trim()

  const bracketed = extractBracketedTitle(title)
  if (bracketed) {
    title = bracketed.title
    if (bracketed.prefix) artist = bracketed.prefix
  } else {
    for (const delimiter of ARTIST_TITLE_DELIMITERS) {
      if (title.includes(delimiter)) {
        const idx = title.indexOf(delimiter)
        const maybeArtist = title.slice(0, idx).trim()
        title = title.slice(idx + delimiter.length).trim()
        if (maybeArtist) artist = maybeArtist
        break
      }
    }
  }

  title = stripJunkPhrases(title)
  title = stripTrailingBracketChain(title)
  title = title.replace(/^[\s\-/|:「」『』()[\]【】]+|[\s\-/|:「」『』()[\]【】]+$/g, '')

  artist = stripJunkPhrases(artist)
  artist = cleanArtistName(artist)

  // De-duplicate: title shouldn't still start with the artist's own name.
  if (artist && title.toLowerCase().startsWith(artist.toLowerCase())) {
    title = title.slice(artist.length).replace(/^[\s\-/|:「」『』]+/, '')
  }

  return { title, artist }
}
