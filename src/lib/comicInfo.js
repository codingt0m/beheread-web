// Reads ComicInfo.xml (ComicRack standard) from an already-loaded JSZip
// archive. Mirrors archive_handler.py's Archive.read_comicinfo: this is the
// desktop app's highest-priority, fully-offline metadata source.

export async function readComicInfo(zip) {
  const entryName = Object.keys(zip.files).find(
    (n) => !zip.files[n].dir && n.split('/').pop().toLowerCase() === 'comicinfo.xml',
  )
  if (!entryName) return null

  let xmlText
  try {
    xmlText = await zip.files[entryName].async('string')
  } catch {
    return null
  }

  let root
  try {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
    if (doc.querySelector('parsererror')) return null
    root = doc.documentElement
  } catch {
    return null
  }
  if (!root) return null

  const text = (tag) => {
    const el = root.querySelector(tag)
    const value = el?.textContent?.trim()
    return value || null
  }
  const integer = (tag) => {
    const v = text(tag)
    if (v == null) return null
    const n = parseInt(v, 10)
    return Number.isNaN(n) ? null : n
  }

  // A single "main" author: first populated field (Writer takes priority,
  // usually the credited mangaka), first name if several are listed.
  let authors = []
  for (const tag of ['Writer', 'Penciller', 'Author']) {
    const v = text(tag)
    if (v) {
      const first = v.split(',')[0].trim()
      if (first) authors = [first]
      break
    }
  }

  // Standard ComicRack "Manga" field: only the explicit value
  // "YesAndRightToLeft" guarantees a reading direction ("Yes" alone only
  // signals a manga without specifying direction, "No" a western one).
  const manga = text('Manga')?.toLowerCase()
  let readingDirection = null
  if (manga === 'yesandrighttoleft') readingDirection = 'rtl'
  else if (manga === 'no') readingDirection = 'ltr'

  return {
    series: text('Series'),
    title: text('Title'),
    number: integer('Number') ?? integer('Volume'),
    year: integer('Year'),
    month: integer('Month'),
    day: integer('Day'),
    publisher: text('Publisher'),
    authors,
    readingDirection,
  }
}
