// Port of the desktop app's series.py: heuristic series/volume detection from a
// filename (no external metadata), used to group volumes and auto-advance to
// the next one. Filename-only on purpose, so it works identically whether the
// file lives on local disk or in a Drive folder.

const COMBINING_MARKS = new RegExp('[̀-ͯ]', 'g')

function removeAccents(text) {
  return text.normalize('NFD').replace(COMBINING_MARKS, '')
}

const TRAILING_NUMBER = /(?:^|[\s\-_])0*(\d+)\s*$/
const VOLUME_PATTERNS = [
  /\b(?:tome|vol(?:ume)?|chapitre|chap|ch|t)[\s\-_.]*0*(\d+)\b/i,
  /#[\s\-_]*0*(\d+)\b/,
  TRAILING_NUMBER,
]

const ED_PHRASE_SIDE = 'perfect|master|ultimate|ultime|final|double|new|grand.format|' +
  'originale?|couleurs?|prestige|anniversaire|definitive|' +
  'nouvelle|reedition|hardcover'
const EDITION_PHRASE = new RegExp(
  `(?:\\b(?:${ED_PHRASE_SIDE})\\s+)*` +
  `\\b(?:edition|edt)\\b` +
  `(?:\\s+\\b(?:${ED_PHRASE_SIDE})\\b)*`, 'gi')
const EDITION_TERMS = new RegExp(
  '\\b(?:integrale|deluxe|luxe|premium|complet|complete|coffret|' +
  'speciale|special|directors?.cut|extended|limitee|collector|originale|' +
  'couleurs?|kanzenban|kanzembam|bunko|wideban|tankou?bon|omnibus|' +
  'anniversaire|prestige|definitive|reedition)\\b', 'gi')
const LANGUAGE_TERMS = /\b(?:french|francais|anglais|english|vf|vo|vostfr)\b/gi
const EDITION_PATTERNS = [EDITION_PHRASE, EDITION_TERMS, LANGUAGE_TERMS]

const JUNK_GROUP = /[[({][^[\](){}]*[\])}]/g

function stripEditionTerms(name) {
  for (const pattern of EDITION_PATTERNS) {
    const folded = removeAccents(name)
    const parts = []
    let lastEnd = 0
    for (const m of folded.matchAll(pattern)) {
      parts.push(name.slice(lastEnd, m.index))
      parts.push(' ')
      lastEnd = m.index + m[0].length
    }
    parts.push(name.slice(lastEnd))
    name = parts.join('')
  }
  return name
}

function stripEdges(text) {
  return text.replace(/^[\s\-_.]+|[\s\-_.]+$/g, '')
}

function stripReleaseJunk(text) {
  for (;;) {
    const cleaned = text.replace(JUNK_GROUP, ' ')
    if (cleaned === text) break
    text = cleaned
  }
  return stripEdges(text.replace(/\s{2,}/g, ' '))
}

function cleanName(name) {
  name = name.replace(/-\s*(?=\(|$)/g, ' ')
  name = name.replace(/[[({]\s*[\])}]/g, ' ')
  name = stripEditionTerms(name)
  name = name.replace(/\s*-\s*$/, '')
  return stripEdges(name.replace(/\s{2,}/g, ' '))
}

// Returns [seriesName, volumeNumber]; volumeNumber is null if none could be
// extracted (the file is then treated as its own single-volume series).
export function parseSeries(stem) {
  const dedup = stem.replace(/\s*\(\d+\)\s*$/, '').trim()
  if (dedup) stem = dedup

  const work = stem.replace(/_/g, ' ').trim()
  const bare = stripReleaseJunk(work)
  const candidates = [...new Set([bare, work])].filter(Boolean)

  for (const text of candidates) {
    for (const pattern of VOLUME_PATTERNS) {
      const m = pattern.exec(text)
      if (!m) continue
      const number = parseInt(m[1], 10)
      if (pattern === TRAILING_NUMBER && number > 999) continue
      let name = cleanName(text.slice(0, m.index) + text.slice(m.index + m[0].length))
      for (;;) {
        if (!name) break
        const m2 = VOLUME_PATTERNS[0].exec(name) || VOLUME_PATTERNS[1].exec(name)
        if (!m2 || parseInt(m2[1], 10) !== number) break
        name = cleanName(name.slice(0, m2.index) + name.slice(m2.index + m2[0].length))
      }
      if (name) return [name, number]
    }
  }
  return [(candidates[0] ?? stem).trim(), null]
}

export function normalizeName(name) {
  let s = name.toLowerCase()
  s = s.replace(/[\-_]+/g, ' ')
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

export function seriesKey(stem) {
  const [name] = parseSeries(stem)
  return normalizeName(name)
}

// Given the stem of the currently-open volume and the stems of its siblings
// (same Drive folder), finds the one with the next higher volume number in the
// same series. Returns the sibling stem, or null.
export function findNextVolume(currentStem, siblingStems) {
  const [name, volume] = parseSeries(currentStem)
  if (volume == null) return null
  const key = normalizeName(name)

  const candidates = []
  for (const sib of siblingStems) {
    if (sib === currentStem) continue
    const [sname, svolume] = parseSeries(sib)
    if (svolume != null && normalizeName(sname) === key) {
      candidates.push([svolume, sib])
    }
  }
  const better = candidates.filter((c) => c[0] > volume)
  if (better.length === 0) return null
  better.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
  return better[0][1]
}
