// Orchestrates volume metadata lookup, mirroring the desktop app's
// metadata.py four-level cascade:
//
// 1. ComicInfo.xml (local, inside the archive) - top priority: reliable and
//    100% offline if the user has tagged their files.
// 2. Google Books - combines series title + volume number to get a precise
//    physical-edition release date.
// 3. AniList - series-level only (no volume concept), good synonym/
//    translated-title support.
// 4. MangaDex - last resort, widest catalog (niche/indie/French/webtoon
//    works), lets more files get at least an author and year.
//
// Each layer is only queried if the previous one found nothing useful. The
// two series-level layers (AniList then MangaDex) are shared between a
// volume's own metadata and the series cache entry (reused by every other
// volume of that series).
import { readComicInfo } from './comicInfo.js'
import * as googleBooks from './metadataSources/googleBooks.js'
import * as aniList from './metadataSources/aniList.js'
import * as mangaDex from './metadataSources/mangaDex.js'

// Bumped whenever a source is added/removed from the cascade. A "not_found"
// cache entry written by an older version can now succeed (a new source was
// added since) - see isStaleNotFound, which invalidates such entries so
// they're retried automatically, without ever retrying a still-current
// "not_found" indefinitely.
export const CASCADE_VERSION = 2

export function notFoundSentinel() {
  return { not_found: true, cascade_version: CASCADE_VERSION }
}

export function isStaleNotFound(cached) {
  return Boolean(cached?.not_found) && (cached.cascade_version ?? 1) < CASCADE_VERSION
}

// Diacritics stripped: empirically, AniList (and likely Google Books)
// search often fails on an accented French title but succeeds on its
// unaccented form - querying with the folded version noticeably improves
// the hit rate.
function foldAccents(text) {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '')
}

function useful(data) {
  return Boolean(data) && Boolean((data.authors && data.authors.length) || data.published_year)
}

async function readComicInfoMeta(zip) {
  const raw = await readComicInfo(zip)
  if (!raw) return null
  return {
    authors: raw.authors || [],
    published_year: raw.year ?? null,
    title: raw.title || raw.series || null,
  }
}

// Series-level search, online, in priority order: AniList (structured data,
// good synonyms/translated titles) then MangaDex (widest niche catalog,
// where AniList stays silent). Returns [seriesData, networkOk]: seriesData
// already carries its "source" key and serves as-is both as volume metadata
// and as a series cache entry; networkOk=false if a source failed on the
// network (should be retried, not cached as "nothing found").
async function searchSeriesSources(queryName) {
  let networkOk = true
  try {
    const al = await aniList.searchSeries(queryName)
    if (useful(al)) return [{ ...al, source: 'anilist' }, networkOk]
  } catch (e) {
    if (!(e instanceof aniList.AniListError)) throw e
    networkOk = false
  }
  try {
    const md = await mangaDex.searchSeries(queryName)
    if (useful(md)) return [{ ...md, source: 'mangadex' }, networkOk]
  } catch (e) {
    if (!(e instanceof mangaDex.MangaDexError)) throw e
    networkOk = false
  }
  return [null, networkOk]
}

// Series-level lookup only (author + start year), AniList then MangaDex.
// Returns [seriesData, ok]: seriesData is the found dict (or the not-found
// sentinel), ok=false if the network failed without finding anything (to be
// retried, not cached).
export async function fetchSeries(seriesName) {
  const [series, ok] = await searchSeriesSources(foldAccents(seriesName))
  if (useful(series)) return [series, true]
  if (!ok) return [null, false]
  return [notFoundSentinel(), true]
}

// Returns [volumeData, networkOk, seriesData].
//
// volumeData  : metadata dict for this exact file, or null.
// networkOk   : false if a network layer failed AND nothing useful was
//               found (the caller must then not cache an absence of result
//               - retry later).
// seriesData  : freshly-fetched SERIES-level dict (to be cached separately,
//               shared across all volumes), or null if not queried or
//               already supplied via cachedSeries.
export async function fetchVolume(zip, seriesName, volume, cachedSeries = null) {
  const info = await readComicInfoMeta(zip)
  if (useful(info)) return [{ ...info, source: 'comicinfo' }, true, null]

  const queryName = foldAccents(seriesName)
  let networkOk = true

  let gb = null
  try {
    gb = await googleBooks.searchVolume(queryName, volume)
  } catch (e) {
    if (!(e instanceof googleBooks.GoogleBooksError)) throw e
    networkOk = false
  }
  if (useful(gb)) return [{ ...gb, source: 'googlebooks' }, true, null]

  // Series level (AniList then MangaDex): reuse the series cache if it's
  // already populated and still current (a stale "not_found", written by a
  // shorter cascade, is treated as absent - see isStaleNotFound), otherwise
  // query the network.
  if (cachedSeries != null && !isStaleNotFound(cachedSeries)) {
    const cached = cachedSeries.not_found ? null : cachedSeries
    if (useful(cached)) {
      const out = { ...cached }
      if (!out.source) out.source = 'series'
      return [out, true, null]
    }
    return [null, networkOk, null]
  }

  const [series, ok] = await searchSeriesSources(queryName)
  if (!ok) networkOk = false
  if (useful(series)) return [{ ...series }, true, series]
  const seriesData = ok ? notFoundSentinel() : null
  return [null, networkOk, seriesData]
}
