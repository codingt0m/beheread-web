// Local cache of downloaded archives in IndexedDB, so re-opening a volume
// (or coming back to it) is instant and works offline instead of
// re-downloading the whole .cbz from Drive every time. Bounded to the last
// MAX_ARCHIVES volumes (LRU eviction) to keep disk usage in check.
//
// Keyed by content identity (entry.contentKey = md5-based), so two identical
// files share one cache entry and the cache survives a rename/move in Drive.
//
// Uses its own IndexedDB database (separate from indexedDbCache.js's kv
// store) to avoid version/upgrade coupling between the two. Two object
// stores: the big ArrayBuffers live in `archives`; small {name,size,ts}
// records live in `meta`, so LRU eviction can pick a victim without loading
// every cached buffer into memory.
import { downloadFile } from './drive.js'

const DB_NAME = 'beheread-web-cache'
const ARCHIVES = 'archives'
const META = 'meta'
const MAX_ARCHIVES = 2

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(ARCHIVES)) db.createObjectStore(ARCHIVES)
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function reqResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

async function getCachedArchive(key) {
  const db = await openDb()
  const tx = db.transaction([ARCHIVES, META], 'readwrite')
  const buffer = await reqResult(tx.objectStore(ARCHIVES).get(key))
  if (buffer) {
    // Touch last-access time so LRU eviction keeps the volumes actually in use.
    const meta = await reqResult(tx.objectStore(META).get(key))
    tx.objectStore(META).put({ ...(meta || {}), ts: Date.now() }, key)
  }
  await txDone(tx)
  return buffer ?? null
}

async function putArchive(key, buffer, name) {
  const db = await openDb()
  const tx = db.transaction([ARCHIVES, META], 'readwrite')
  tx.objectStore(ARCHIVES).put(buffer, key)
  tx.objectStore(META).put({ name, size: buffer.byteLength, ts: Date.now() }, key)
  await txDone(tx)
  await evictToLimit()
}

async function evictToLimit() {
  const db = await openDb()
  const readTx = db.transaction(META, 'readonly')
  const store = readTx.objectStore(META)
  // getAllKeys() and getAll() both return in ascending key order, so index i
  // pairs a key with its meta record.
  const keys = await reqResult(store.getAllKeys())
  const metas = await reqResult(store.getAll())
  await txDone(readTx)
  if (keys.length <= MAX_ARCHIVES) return

  const paired = keys.map((k, i) => ({ key: k, ts: metas[i]?.ts ?? 0 }))
  paired.sort((a, b) => a.ts - b.ts) // oldest first
  const victims = paired.slice(0, paired.length - MAX_ARCHIVES)

  const delTx = db.transaction([ARCHIVES, META], 'readwrite')
  for (const { key } of victims) {
    delTx.objectStore(ARCHIVES).delete(key)
    delTx.objectStore(META).delete(key)
  }
  await txDone(delTx)
}

// Content keys of the archives currently held in the local cache, so the
// library can flag which volumes are available instantly / offline. Reads
// only the (small) meta store keys - no buffers loaded. Returns [] on any
// failure (e.g. private mode with IndexedDB disabled).
export async function getCachedKeys() {
  try {
    const db = await openDb()
    const tx = db.transaction(META, 'readonly')
    const keys = await reqResult(tx.objectStore(META).getAllKeys())
    await txDone(tx)
    return keys
  } catch {
    return []
  }
}

// Empties the whole archive cache (both stores). Safe: the files remain in
// Drive and are re-downloaded on next open; this only frees local storage.
export async function clearArchiveCache() {
  try {
    const db = await openDb()
    const tx = db.transaction([ARCHIVES, META], 'readwrite')
    tx.objectStore(ARCHIVES).clear()
    tx.objectStore(META).clear()
    await txDone(tx)
  } catch {
    /* nothing cached / IndexedDB unavailable: nothing to clear */
  }
}

// Returns the archive bytes for a library entry, from the local cache if
// present, otherwise downloading from Drive and caching the result. Cache
// read/write failures are non-fatal (fall back to a plain download) so a
// storage hiccup never blocks reading.
export async function getOrDownloadArchive(token, entry, onProgress) {
  try {
    const cached = await getCachedArchive(entry.contentKey)
    if (cached) return cached
  } catch {
    /* cache read failed: fall through to a fresh download */
  }
  const buffer = await downloadFile(token, entry.id, onProgress)
  try {
    await putArchive(entry.contentKey, buffer, entry.name)
  } catch {
    /* cache write failed (quota, private mode...): serve the download anyway */
  }
  return buffer
}
