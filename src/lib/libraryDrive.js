// Turns a flat list of Drive files (from drive.scanFolderRecursive) into
// library entries: dedup identical files, prefer the copy with reading
// progress when the same (series, volume) appears in more than one release,
// group into series, and support search/next-volume navigation - the web
// equivalent of library.py + series.py working together.
import { findNextVolume, normalizeName, parseSeries } from './series.js'
import { keyForDriveFile, SERIES_DETACHED } from './store.js'

function stemOf(name) {
  return name.replace(/\.[^./]+$/, '')
}

function progressRank(progress) {
  if (!progress) return 0
  if (progress.finished) return 2
  if (progress.page > 0) return 1
  return 0
}

// Builds one entry per unique piece of content, with a de-dup pass:
// 1. Identical files (same content key) collapse to a single entry.
// 2. Different releases of the same (series, volume number) collapse to
//    the one with the most reading progress, so a re-download/alternate
//    scanlation doesn't create a second "unread" row next to the copy the
//    user was already reading.
export function buildLibraryEntries(files, store) {
  const byContentKey = new Map()
  for (const f of files) {
    const key = keyForDriveFile(f)
    if (!byContentKey.has(key)) byContentKey.set(key, f)
  }

  const bySlot = new Map()
  for (const f of byContentKey.values()) {
    const contentKey = keyForDriveFile(f)
    const stem = stemOf(f.name)
    const override = store?.seriesOverride(contentKey)
    const [rawName, volume] = parseSeries(stem)
    const slot =
      volume != null && override !== SERIES_DETACHED
        ? `${normalizeName(rawName)}::${volume}`
        : `solo::${contentKey}`

    const existing = bySlot.get(slot)
    if (!existing) {
      bySlot.set(slot, f)
      continue
    }
    const existingProgress = store?.getProgress(keyForDriveFile(existing))
    const progress = store?.getProgress(contentKey)
    if (progressRank(progress) > progressRank(existingProgress)) {
      bySlot.set(slot, f)
    }
  }

  const entries = []
  for (const f of bySlot.values()) {
    const stem = stemOf(f.name)
    const contentKey = keyForDriveFile(f)
    const [seriesName, volume] = parseSeries(stem)
    entries.push({
      id: f.id,
      name: f.name,
      stem,
      size: Number(f.size ?? 0),
      modifiedTime: f.modifiedTime,
      parentId: f.parentId,
      contentKey,
      seriesName,
      seriesKeyNorm: normalizeName(seriesName),
      volume,
      progress: store?.getProgress(contentKey) ?? null,
    })
  }
  return entries
}

export function groupBySeries(entries) {
  const groups = new Map()
  for (const e of entries) {
    if (!groups.has(e.seriesKeyNorm)) {
      groups.set(e.seriesKeyNorm, { seriesKey: e.seriesKeyNorm, seriesName: e.seriesName, items: [] })
    }
    groups.get(e.seriesKeyNorm).items.push(e)
  }
  for (const g of groups.values()) {
    g.items.sort((a, b) => (a.volume ?? 0) - (b.volume ?? 0) || a.name.localeCompare(b.name))
  }
  return [...groups.values()].sort((a, b) => a.seriesName.localeCompare(b.seriesName))
}

export function filterEntries(entries, query) {
  const q = query.trim().toLowerCase()
  if (!q) return entries
  return entries.filter(
    (e) => e.seriesName.toLowerCase().includes(q) || e.name.toLowerCase().includes(q),
  )
}

// Resolves the next volume of the given entry among its Drive folder
// siblings (same parentId), for the reader's auto-advance feature.
export function nextVolumeEntry(entry, allEntries) {
  const siblings = allEntries.filter((e) => e.parentId === entry.parentId).map((e) => e.stem)
  const nextStem = findNextVolume(entry.stem, siblings)
  if (!nextStem) return null
  return allEntries.find((e) => e.parentId === entry.parentId && e.stem === nextStem) ?? null
}
