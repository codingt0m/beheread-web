// Minimal client for the AniList API (free GraphQL, no auth). Used as a
// series-level (not per-volume) fallback: unlike MyAnimeList/Jikan, AniList
// handles synonyms/translated titles well, useful when the filename carries
// a localized title. AniList serves CORS headers, so this runs directly from
// the browser.
import { createThrottle } from '../throttle.js'

const URL = 'https://graphql.anilist.co'
const throttle = createThrottle(700)

const QUERY = `
query ($search: String) {
  Media(search: $search, type: MANGA) {
    title { romaji english native }
    staff(perPage: 1) { nodes { name { full } } }
    startDate { year }
    countryOfOrigin
  }
}
`

export class AniListError extends Error {}

export async function searchSeries(name) {
  await throttle()
  let res
  try {
    res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { search: name } }),
    })
  } catch (e) {
    throw new AniListError(e.message)
  }
  // AniList returns 404 with a JSON body when the search finds nothing -
  // not a network error.
  if (res.status === 404) return null
  if (!res.ok) throw new AniListError(`HTTP ${res.status}`)

  let payload
  try {
    payload = await res.json()
  } catch (e) {
    throw new AniListError(e.message)
  }

  const media = payload?.data?.Media
  if (!media) return null

  const titles = media.title || {}
  const title = titles.english || titles.romaji || titles.native || name
  // Only the main author (first staff member, usually the credited mangaka).
  const staffNodes = media.staff?.nodes || []
  const fullName = staffNodes[0]?.name?.full
  const authors = fullName ? [fullName] : []
  const year = media.startDate?.year ?? null
  // Country of origin ("JP", "KR", "CN"...): hint for the default reading
  // direction when the archive has no ComicInfo.xml (Japanese manga reads
  // right-to-left, the rest left-to-right).
  const country = media.countryOfOrigin ?? null

  return { title, authors, published_year: year, country }
}
