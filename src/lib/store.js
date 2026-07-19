// Cloud-backed persistence: settings/progress/metadata-cache, mirroring
// storage.py's Store but written to the user's Drive appDataFolder instead
// of a local %APPDATA% JSON file, with an IndexedDB mirror for instant
// offline-first reads and to avoid a Drive round-trip on every keystroke.
//
// Content identity: instead of desktop's sha1(size + first 64KB) fingerprint
// (needed there because it has no cheap file-identity signal), Drive already
// hands back an md5Checksum in the folder listing - free, no download
// required - so it's used directly as the "key_for" a file. This is what
// lets progress/metadata survive a rename or move within Drive.
import { readAppDataJSON, writeAppDataJSON } from './drive.js'
import { idbGet, idbSet } from './indexedDbCache.js'

const SAVE_DELAY_MS = 600

const FILES = {
  settings: 'settings.json',
  progress: 'progress.json',
  meta: 'meta_cache.json',
}

function defaultSettings() {
  return {
    folders: [],
    libraryFolder: null,
    reader: {},
    library: {},
    ui: {},
    series_overrides: {},
    series_direction: {},
    volume_direction: {},
  }
}

function defaultMetaCache() {
  return { volume: {}, series: {} }
}

export function keyForDriveFile(file) {
  if (file.md5Checksum) return `md5:${file.md5Checksum}`
  return `id:${file.id}`
}

export class Store {
  // `getToken` is called lazily on every save/flush (not stored once) since
  // the access token is refreshed independently of this object's lifetime.
  constructor(getToken) {
    this.getToken = getToken
    this.settings = defaultSettings()
    this.progress = {}
    this.metaCache = defaultMetaCache()
    this._dirty = new Set()
    this._timer = null
  }

  async init() {
    const [cachedSettings, cachedProgress, cachedMeta] = await Promise.all([
      idbGet(FILES.settings),
      idbGet(FILES.progress),
      idbGet(FILES.meta),
    ])
    if (cachedSettings) this.settings = cachedSettings
    if (cachedProgress) this.progress = cachedProgress
    if (cachedMeta) this.metaCache = cachedMeta

    const token = this.getToken()
    if (!token) return
    const [settings, progress, meta] = await Promise.all([
      readAppDataJSON(token, FILES.settings, defaultSettings()),
      readAppDataJSON(token, FILES.progress, {}),
      readAppDataJSON(token, FILES.meta, defaultMetaCache()),
    ])
    this.settings = settings
    this.progress = progress
    this.metaCache = meta
    await Promise.all([
      idbSet(FILES.settings, this.settings),
      idbSet(FILES.progress, this.progress),
      idbSet(FILES.meta, this.metaCache),
    ])
  }

  _partData(part) {
    return part === 'meta' ? this.metaCache : this[part]
  }

  // Marks a part dirty and (re)arms the debounce timer, exactly like
  // storage.py's _schedule: as long as changes keep arriving, the write is
  // pushed back by SAVE_DELAY_MS instead of hitting Drive on every page turn.
  _schedule(part) {
    this._dirty.add(part)
    if (this._timer) clearTimeout(this._timer)
    this._timer = setTimeout(() => {
      this.flush()
    }, SAVE_DELAY_MS)
  }

  async flush() {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
    const dirty = [...this._dirty]
    this._dirty.clear()
    if (dirty.length === 0) return
    const token = this.getToken()
    await Promise.all(
      dirty.map(async (part) => {
        const data = this._partData(part)
        await idbSet(FILES[part], data)
        if (token) await writeAppDataJSON(token, FILES[part], data)
      }),
    )
  }

  // ---- library folder (web equivalent of desktop's folder list; a single
  // root Drive folder is enough to cover the Drive-storage use case) ----
  libraryFolder() {
    return this.settings.libraryFolder ?? null
  }

  setLibraryFolder(folder) {
    this.settings.libraryFolder = folder
    this._schedule('settings')
    return this.flush() // rare/important change: write immediately
  }

  // ---- reading progress ----
  getProgress(key) {
    const entry = this.progress[key]
    if (!entry) return null
    return { page: entry.page ?? 0, total: entry.total ?? 0, finished: Boolean(entry.finished) }
  }

  setProgress(key, page, total, finished) {
    this.progress[key] = { ...this.progress[key], page, total, finished, ts: Date.now() }
    this._schedule('progress')
  }

  progressTs(key) {
    return this.progress[key]?.ts ?? 0
  }

  clearProgress(key) {
    if (this.progress[key] !== undefined) {
      delete this.progress[key]
      this._schedule('progress')
      return this.flush()
    }
    return Promise.resolve()
  }

  getReaderOffset(key) {
    return this.progress[key]?.offset ?? 0
  }

  setReaderOffset(key, offset) {
    this.progress[key] = { ...this.progress[key], offset: offset & 1 }
    this._schedule('progress')
  }

  // ---- metadata cache ----
  volumeMeta(key) {
    return this.metaCache.volume[key] ?? null
  }

  setVolumeMeta(key, data) {
    this.metaCache.volume[key] = data
    this._schedule('meta')
  }

  seriesMeta(seriesKey) {
    return this.metaCache.series[seriesKey] ?? null
  }

  setSeriesMeta(seriesKey, data) {
    this.metaCache.series[seriesKey] = data
    this._schedule('meta')
  }

  // ---- manual series grouping override (drag out of / into a series) ----
  seriesOverride(key) {
    return this.settings.series_overrides?.[key] ?? null
  }

  setSeriesOverride(key, value) {
    this.settings.series_overrides ??= {}
    this.settings.series_overrides[key] = value
    this._schedule('settings')
    return this.flush()
  }

  clearSeriesOverride(key) {
    if (this.settings.series_overrides?.[key] !== undefined) {
      delete this.settings.series_overrides[key]
      this._schedule('settings')
      return this.flush()
    }
    return Promise.resolve()
  }

  // ---- reading direction (per-series if the volume belongs to one, else
  // per-volume - changing it on one volume of a series applies to all) ----
  readingDirection(key, seriesKey) {
    if (seriesKey && this.settings.series_direction?.[seriesKey] !== undefined) {
      return Boolean(this.settings.series_direction[seriesKey])
    }
    const v = this.settings.volume_direction?.[key]
    return v === undefined ? null : Boolean(v)
  }

  setReadingDirection(key, seriesKey, mangaMode) {
    if (seriesKey) {
      this.settings.series_direction ??= {}
      this.settings.series_direction[seriesKey] = Boolean(mangaMode)
    } else {
      this.settings.volume_direction ??= {}
      this.settings.volume_direction[key] = Boolean(mangaMode)
    }
    this._schedule('settings')
    return this.flush()
  }
}

export const SERIES_DETACHED = '\x00__detached__'
