// Minimal client for the public Google Books API (no key), used as the 2nd
// priority to find a precise VOLUME release date - unlike AniList/MangaDex,
// which only document the series as a whole. No cover fetching here: the
// archive's first page already serves as the cover.
import { sequenceRatio } from '../textSimilarity.js'
import { createThrottle } from '../throttle.js'

const BASE_URL = 'https://www.googleapis.com/books/v1/volumes'
const throttle = createThrottle(1000)

export class GoogleBooksError extends Error {}

function normTokens(text) {
  return new Set((text || '').toLowerCase().match(/[\p{L}\p{N}_]+/gu) || [])
}

// Google Books often returns an unrelated book when the series isn't
// indexed (it falls back to the first result regardless): only accept an
// item whose title genuinely matches the requested series.
export function titleMatches(seriesName, title) {
  const want = normTokens(seriesName)
  const got = normTokens(title)
  if (want.size === 0 || got.size === 0) return false
  const covered = [...want].filter((t) => got.has(t)).length / want.size
  if (covered >= 0.75) return true
  return sequenceRatio([...want].sort().join(' '), [...got].sort().join(' ')) >= 0.6
}

export async function searchVolume(seriesName, number, lang = 'fr') {
  const query = number ? `${seriesName} tome ${number}` : seriesName
  const params = new URLSearchParams({ q: query, maxResults: '5' })
  if (lang) params.set('langRestrict', lang)

  await throttle()
  let payload
  try {
    const res = await fetch(`${BASE_URL}?${params}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    payload = await res.json()
  } catch (e) {
    throw new GoogleBooksError(e.message)
  }

  const items = payload.items || []
  if (items.length === 0) return null

  let info = null
  for (const item of items) {
    const vi = item.volumeInfo || {}
    if (titleMatches(seriesName, vi.title || '')) {
      info = vi
      break
    }
  }
  if (!info) return null

  const published = info.publishedDate
  let year = null
  if (published) {
    const y = parseInt(String(published).slice(0, 4), 10)
    year = Number.isNaN(y) ? null : y
  }

  return {
    title: info.title,
    authors: (info.authors || []).slice(0, 1),
    published_date: published,
    published_year: year,
  }
}
