// Minimal client for the MangaDex API (public, no key/auth). Widest fallback
// for series metadata: MangaDex's catalog covers a lot of niche/indie/
// webtoon works where AniList and Google Books stay silent, so it's the last
// resort in the cascade. Unlike the desktop client, no custom User-Agent is
// sent - browsers forbid overriding it via fetch, and MangaDex's CORS
// support means the browser's real UA is accepted fine.
import { sequenceRatio } from '../textSimilarity.js'
import { createThrottle } from '../throttle.js'

const BASE_URL = 'https://api.mangadex.org/manga'
const throttle = createThrottle(300)
const MIN_SCORE = 0.5
const PAREN_SUFFIX = /\s*[(（][^)）]*[)）]\s*$/

// Original language -> AniList-style country code, for a consistent reading
// direction: Japanese -> Japan (RTL), Korean/Chinese -> manhwa/manhua (LTR).
const LANG_COUNTRY = { ja: 'JP', ko: 'KR', zh: 'CN', 'zh-hk': 'CN', 'zh-ro': 'CN' }

export class MangaDexError extends Error {}

function normTokens(text) {
  return new Set((text || '').toLowerCase().match(/[\p{L}\p{N}_]+/gu) || [])
}

// Symmetric similarity (Jaccard on tokens, complemented by a sequence
// ratio): a spin-off like "Solo Leveling: Ragnarok" must not score as high
// as "Solo Leveling" for the query "Solo Leveling" - plain coverage of the
// requested tokens isn't enough since the spin-off contains them all too.
function titleScore(seriesName, titles) {
  const want = normTokens(seriesName)
  if (want.size === 0) return 0
  let best = 0
  for (const title of titles) {
    const got = normTokens(title)
    if (got.size === 0) continue
    const union = new Set([...want, ...got])
    const inter = [...want].filter((t) => got.has(t)).length
    const jaccard = inter / union.size
    const ratio = sequenceRatio([...want].sort().join(' '), [...got].sort().join(' '))
    best = Math.max(best, jaccard, ratio)
  }
  return best
}

function allTitles(attr) {
  const titles = Object.values(attr.title || {})
  for (const alt of attr.altTitles || []) titles.push(...Object.values(alt))
  return titles.filter(Boolean)
}

function displayTitle(attr, fallback) {
  const t = attr.title || {}
  return t.en || Object.values(t)[0] || fallback
}

function cleanAuthor(name) {
  return (name || '').replace(PAREN_SUFFIX, '').trim()
}

function mainAuthor(relationships) {
  const authors = []
  const artists = []
  for (const rel of relationships || []) {
    const attr = rel.attributes || {}
    const name = cleanAuthor(attr.name)
    if (!name) continue
    if (rel.type === 'author') authors.push(name)
    else if (rel.type === 'artist') artists.push(name)
  }
  return (authors.length ? authors : artists).slice(0, 1)
}

function countryOf(lang) {
  if (!lang) return null
  return LANG_COUNTRY[lang.toLowerCase()] || lang.toUpperCase().slice(0, 2)
}

export async function searchSeries(name) {
  const params = new URLSearchParams()
  params.set('title', name)
  params.set('limit', '5')
  params.append('includes[]', 'author')
  params.append('includes[]', 'artist')
  params.set('order[relevance]', 'desc')

  await throttle()
  let res
  try {
    res = await fetch(`${BASE_URL}?${params}`, { headers: { Accept: 'application/json' } })
  } catch (e) {
    throw new MangaDexError(e.message)
  }
  if (res.status === 404) return null
  if (!res.ok) throw new MangaDexError(`HTTP ${res.status}`)

  let payload
  try {
    payload = await res.json()
  } catch (e) {
    throw new MangaDexError(e.message)
  }

  const items = payload.data || []
  if (items.length === 0) return null

  // Best-scoring candidate, not the first one above threshold: MangaDex
  // often ranks a spin-off/sequel first, which covers the same tokens as
  // the main work.
  let best = null
  let bestScore = MIN_SCORE
  for (const it of items) {
    const score = titleScore(name, allTitles(it.attributes || {}))
    if (score >= bestScore) {
      best = it
      bestScore = score
    }
  }
  if (!best) return null

  const attr = best.attributes || {}
  const parsedYear = parseInt(attr.year, 10)
  const year = Number.isNaN(parsedYear) ? null : parsedYear

  return {
    title: displayTitle(attr, name),
    authors: mainAuthor(best.relationships),
    published_year: year,
    country: countryOf(attr.originalLanguage),
  }
}
