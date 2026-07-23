import { defineStore } from 'pinia'
import type { Collection, Album, SongReference } from '~/types/library'
import { deleteFile } from '~/services/uploadedAudioStore'

export const useLibraryStore = defineStore('library', {
  state: () => ({
    collections: [] as Collection[],
  }),

  actions: {
    createCollection(name: string, language: string): Collection {
      const newCollection: Collection = {
        id: crypto.randomUUID(),
        name,
        language,
        albums: [],
        createdAt: Date.now(),
        songCount: 0,
      }
      this.collections.push(newCollection)
      return newCollection
    },

    deleteCollection(collectionId: string) {
      this.collections = this.collections.filter((c) => c.id !== collectionId)
    },

    getCollection(collectionId: string): Collection | undefined {
      return this.collections.find((c) => c.id === collectionId)
    },

    updateCollectionName(collectionId: string, newName: string) {
      const collection = this.getCollection(collectionId)
      if (collection) collection.name = newName
    },

    createAlbum(collectionId: string, name: string): Album | undefined {
      const collection = this.getCollection(collectionId)
      if (!collection) return undefined

      const newAlbum: Album = {
        id: crypto.randomUUID(),
        name,
        collectionId,
        songReferences: [],
        createdAt: Date.now(),
        coverImages: [],
      }
      collection.albums.push(newAlbum)
      return newAlbum
    },

    getAlbum(collectionId: string, albumId: string): Album | undefined {
      return this.getCollection(collectionId)?.albums.find((a) => a.id === albumId)
    },

    deleteAlbum(collectionId: string, albumId: string) {
      const collection = this.getCollection(collectionId)
      if (!collection) return
      collection.albums = collection.albums.filter((a) => a.id !== albumId)
      collection.songCount = collection.albums.reduce((sum, a) => sum + a.songReferences.length, 0)
    },

    addSongToAlbum(collectionId: string, albumId: string, song: SongReference) {
      const collection = this.getCollection(collectionId)
      const album = collection?.albums.find((a) => a.id === albumId)
      if (!collection || !album) return

      album.songReferences.push(song)
      album.coverImages = album.songReferences.slice(0, 4).map((s) => s.thumbnailUrl)
      collection.songCount += 1
    },

    removeSongFromAlbum(collectionId: string, albumId: string, songId: string) {
      const collection = this.getCollection(collectionId)
      const album = collection?.albums.find((a) => a.id === albumId)
      if (!collection || !album) return

      const removed = album.songReferences.find((s) => s.id === songId)
      album.songReferences = album.songReferences.filter((s) => s.id !== songId)
      album.coverImages = album.songReferences.slice(0, 4).map((s) => s.thumbnailUrl)
      collection.songCount -= 1

      // Uploaded files are shared by content_hash — only delete the persisted
      // blob once no other song reference (in any collection) still points at it.
      if (removed?.contentHash && !this.isContentHashStillReferenced(removed.contentHash)) {
        deleteFile(removed.contentHash)
      }
    },

    isContentHashStillReferenced(contentHash: string): boolean {
      return this.collections.some((c) =>
        c.albums.some((a) => a.songReferences.some((s) => s.contentHash === contentHash))
      )
    },

    /**
     * Attaches an uploaded file to an existing song reference in place (e.g. a
     * YouTube-discovered song that had no lyrics source available) — the
     * reference keeps its youtubeId for display/thumbnail purposes, but gains
     * a contentHash, which unlocks ASR/Hybrid for it (see LyricsStrategyPicker.vue).
     */
    attachAudioToSong(collectionId: string, albumId: string, songRefId: string, contentHash: string, uploadedFileName: string) {
      const song = this.getAlbum(collectionId, albumId)?.songReferences.find((s) => s.id === songRefId)
      if (!song) return
      song.contentHash = contentHash
      song.uploadedFileName = uploadedFileName
    },

    markSongAsProcessed(collectionId: string, albumId: string, songRefId: string, processedSongId: string) {
      const song = this.getAlbum(collectionId, albumId)?.songReferences.find((s) => s.id === songRefId)
      if (!song) return
      song.isProcessed = true
      song.processedSongId = processedSongId
    },

    updateSongGenre(collectionId: string, albumId: string, songId: string, genre: string) {
      const song = this.getAlbum(collectionId, albumId)?.songReferences.find((s) => s.id === songId)
      if (song) song.genre = genre
    },

    getSongReference(collectionId: string, albumId: string, songId: string): SongReference | undefined {
      return this.getAlbum(collectionId, albumId)?.songReferences.find((s) => s.id === songId)
    },

    /** Find a song reference by ID across all collections/albums */
    findSongReference(
      songId: string
    ): { song: SongReference; albumId: string; collectionId: string } | undefined {
      for (const collection of this.collections) {
        for (const album of collection.albums) {
          const song = album.songReferences.find((s) => s.id === songId)
          if (song) return { song, albumId: album.id, collectionId: collection.id }
        }
      }
      return undefined
    },
  },

  persist: true,
})
