import { describe, expect, it } from 'vitest'
import { buildLibraryEntries, filterEntries, groupBySeries, nextVolumeEntry } from './libraryDrive.js'

function makeStore({ progress = {}, overrides = {} } = {}) {
  return {
    getProgress: (key) => progress[key] ?? null,
    seriesOverride: (key) => overrides[key] ?? null,
  }
}

describe('buildLibraryEntries', () => {
  it('collapses identical files sharing the same md5Checksum', () => {
    const files = [
      { id: '1', name: 'One Piece - Tome 1.cbz', md5Checksum: 'abc', parentId: 'root' },
      { id: '2', name: 'One Piece - Tome 1 (copy).cbz', md5Checksum: 'abc', parentId: 'root' },
    ]
    const entries = buildLibraryEntries(files, makeStore())
    expect(entries).toHaveLength(1)
  })

  it('prefers the release with reading progress when volumes collide', () => {
    const files = [
      { id: '1', name: 'Naruto Tome 5 (ScanGroupA).cbz', md5Checksum: 'aaa', parentId: 'root' },
      { id: '2', name: 'Naruto Tome 5 (ScanGroupB).cbz', md5Checksum: 'bbb', parentId: 'root' },
    ]
    const store = makeStore({ progress: { 'md5:bbb': { page: 10, total: 20, finished: false } } })
    const entries = buildLibraryEntries(files, store)
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('2')
  })

  it('keeps standalone (no volume number) files distinct', () => {
    const files = [
      { id: '1', name: 'Akira.cbz', md5Checksum: 'a1', parentId: 'root' },
      { id: '2', name: 'Gloutons et Dragons.cbz', md5Checksum: 'a2', parentId: 'root' },
    ]
    const entries = buildLibraryEntries(files, makeStore())
    expect(entries).toHaveLength(2)
  })
})

describe('groupBySeries', () => {
  it('groups and sorts volumes ascending within a series', () => {
    const files = [
      { id: '1', name: 'One Piece - Tome 2.cbz', md5Checksum: 'p2', parentId: 'root' },
      { id: '2', name: 'One Piece - Tome 1.cbz', md5Checksum: 'p1', parentId: 'root' },
      { id: '3', name: 'Naruto Tome 1.cbz', md5Checksum: 'n1', parentId: 'root' },
    ]
    const entries = buildLibraryEntries(files, makeStore())
    const groups = groupBySeries(entries)
    expect(groups.map((g) => g.seriesName)).toEqual(['Naruto', 'One Piece'])
    const onePiece = groups.find((g) => g.seriesName === 'One Piece')
    expect(onePiece.items.map((i) => i.volume)).toEqual([1, 2])
  })
})

describe('filterEntries', () => {
  const files = [
    { id: '1', name: 'One Piece - Tome 1.cbz', md5Checksum: 'p1', parentId: 'root' },
    { id: '2', name: 'Naruto Tome 1.cbz', md5Checksum: 'n1', parentId: 'root' },
  ]
  const entries = buildLibraryEntries(files, makeStore())

  it('matches on series name, case-insensitively', () => {
    expect(filterEntries(entries, 'naruto').map((e) => e.name)).toEqual(['Naruto Tome 1.cbz'])
  })

  it('returns everything for an empty query', () => {
    expect(filterEntries(entries, '  ')).toHaveLength(2)
  })
})

describe('nextVolumeEntry', () => {
  it('finds the next volume in the same Drive folder', () => {
    const files = [
      { id: '1', name: 'One Piece - Tome 1.cbz', md5Checksum: 'p1', parentId: 'root' },
      { id: '2', name: 'One Piece - Tome 2.cbz', md5Checksum: 'p2', parentId: 'root' },
    ]
    const entries = buildLibraryEntries(files, makeStore())
    const first = entries.find((e) => e.volume === 1)
    const next = nextVolumeEntry(first, entries)
    expect(next.volume).toBe(2)
  })

  it('ignores siblings from a different Drive folder', () => {
    const files = [
      { id: '1', name: 'One Piece - Tome 1.cbz', md5Checksum: 'p1', parentId: 'root' },
      { id: '2', name: 'One Piece - Tome 2.cbz', md5Checksum: 'p2', parentId: 'other' },
    ]
    const entries = buildLibraryEntries(files, makeStore())
    const first = entries.find((e) => e.volume === 1)
    expect(nextVolumeEntry(first, entries)).toBeNull()
  })
})
