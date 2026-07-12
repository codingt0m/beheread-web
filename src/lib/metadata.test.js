// Ports tests/test_metadata.py: the four-level cascade only queries a layer
// if the previous one found nothing useful, and a network failure must not
// be cached as "nothing found" (networkOk=false). Network clients are
// spied/stubbed - no real network access.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as comicInfoModule from './comicInfo.js'
import { titleMatches } from './metadataSources/googleBooks.js'
import * as googleBooks from './metadataSources/googleBooks.js'
import * as aniList from './metadataSources/aniList.js'
import * as mangaDex from './metadataSources/mangaDex.js'
import { fetchVolume, notFoundSentinel } from './metadata.js'

function noNetwork() {
  throw new Error('the network should not be queried')
}

describe('fetchVolume cascade', () => {
  let comicInfoSpy, gbSpy, alSpy, mdSpy

  beforeEach(() => {
    comicInfoSpy = vi.spyOn(comicInfoModule, 'readComicInfo')
    gbSpy = vi.spyOn(googleBooks, 'searchVolume')
    alSpy = vi.spyOn(aniList, 'searchSeries')
    mdSpy = vi.spyOn(mangaDex, 'searchSeries')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('comicinfo wins without touching the network', async () => {
    comicInfoSpy.mockResolvedValue({ authors: ['Kentaro Miura'], year: 1990 })
    gbSpy.mockImplementation(noNetwork)
    alSpy.mockImplementation(noNetwork)
    mdSpy.mockImplementation(noNetwork)

    const [data, ok, series] = await fetchVolume({}, 'Berserk', 3)
    expect(ok).toBe(true)
    expect(data.source).toBe('comicinfo')
    expect(data.authors).toEqual(['Kentaro Miura'])
    expect(series).toBeNull()
  })

  it('falls back to Google Books', async () => {
    comicInfoSpy.mockResolvedValue(null)
    gbSpy.mockResolvedValue({ authors: ['Oda'], published_year: 1997 })
    alSpy.mockImplementation(noNetwork)
    mdSpy.mockImplementation(noNetwork)

    const [data, ok] = await fetchVolume({}, 'One Piece', 1)
    expect(ok).toBe(true)
    expect(data.source).toBe('googlebooks')
  })

  it('falls back to AniList', async () => {
    comicInfoSpy.mockResolvedValue(null)
    gbSpy.mockResolvedValue(null)
    alSpy.mockResolvedValue({ authors: ['Isayama'], published_year: 2009 })
    mdSpy.mockImplementation(noNetwork) // AniList answered -> MangaDex must not be queried

    const [data, ok, series] = await fetchVolume({}, 'Attack on Titan', 1)
    expect(ok).toBe(true)
    expect(data.source).toBe('anilist')
    expect(series).toEqual({ authors: ['Isayama'], published_year: 2009, source: 'anilist' })
  })

  it('falls back to MangaDex when AniList is silent', async () => {
    comicInfoSpy.mockResolvedValue(null)
    gbSpy.mockResolvedValue(null)
    alSpy.mockResolvedValue(null)
    mdSpy.mockResolvedValue({
      authors: ['Toan'],
      published_year: 2024,
      country: 'FR',
      title: 'Run to Heaven',
    })

    const [data, ok, series] = await fetchVolume({}, 'Run to Heaven', 1)
    expect(ok).toBe(true)
    expect(data.source).toBe('mangadex')
    expect(data.authors).toEqual(['Toan'])
    expect(data.country).toBe('FR')
    expect(series.authors).toEqual(['Toan'])
  })

  it('does not cache a network failure', async () => {
    comicInfoSpy.mockResolvedValue(null)
    gbSpy.mockRejectedValue(new googleBooks.GoogleBooksError('429 too many requests'))
    alSpy.mockRejectedValue(new aniList.AniListError('timeout'))
    mdSpy.mockRejectedValue(new mangaDex.MangaDexError('timeout'))

    const [data, ok, series] = await fetchVolume({}, 'Obscure Title', 1)
    expect(data).toBeNull()
    expect(ok).toBe(false)
    expect(series).toBeNull()
  })

  it('skips the network when a series cache is already present', async () => {
    comicInfoSpy.mockResolvedValue(null)
    gbSpy.mockResolvedValue(null)
    alSpy.mockImplementation(noNetwork)
    mdSpy.mockImplementation(noNetwork)

    const cached = { authors: ['Toriyama'], published_year: 1984 }
    const [data, ok, series] = await fetchVolume({}, 'Dragon Ball', 1, cached)
    expect(ok).toBe(true)
    expect(data.authors).toEqual(['Toriyama'])
    // generic source: the exact origin (anilist/mangadex) isn't reconstructed
    expect(data.source).toBe('series')
    expect(series).toBeNull()
  })

  it('skips the network on a current "not found" series cache', async () => {
    comicInfoSpy.mockResolvedValue(null)
    gbSpy.mockResolvedValue(null)
    alSpy.mockImplementation(noNetwork)
    mdSpy.mockImplementation(noNetwork)

    const [data, ok, series] = await fetchVolume({}, 'Dragon Ball', 1, notFoundSentinel())
    expect(data).toBeNull()
    expect(ok).toBe(true)
    expect(series).toBeNull()
  })

  it('retries a stale "not found" series cache from an older cascade', async () => {
    comicInfoSpy.mockResolvedValue(null)
    gbSpy.mockResolvedValue(null)
    alSpy.mockResolvedValue(null)
    mdSpy.mockResolvedValue({ authors: ['Toan'], published_year: 2024, country: 'FR' })

    const legacyCache = { not_found: true } // old format, no cascade_version
    const [data, ok] = await fetchVolume({}, 'Run to Heaven', 1, legacyCache)
    expect(ok).toBe(true)
    expect(data.authors).toEqual(['Toan'])
    expect(data.source).toBe('mangadex')
  })
})

describe('Google Books title matching', () => {
  it('accepts titles that genuinely match the series', () => {
    expect(titleMatches('One Piece', 'One Piece, Vol. 12')).toBe(true)
    expect(titleMatches('Gloutons et Dragons', 'Gloutons & Dragons Tome 3')).toBe(true)
    expect(titleMatches('Berserk', 'Berserk Deluxe Edition Volume 1')).toBe(true)
  })

  it('rejects unrelated titles, falling back to AniList', () => {
    expect(titleMatches('Gloutons et Dragons', 'Dungeon Meshi')).toBe(false)
    expect(titleMatches('Parasite', 'The Selfish Gene')).toBe(false)
    expect(titleMatches('One Piece', '')).toBe(false)
  })
})
