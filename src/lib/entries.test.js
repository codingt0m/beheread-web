import { describe, expect, it } from 'vitest'
import { naturalCompare, filterAndSortEntries } from './entries.js'

describe('naturalCompare', () => {
  it('trie les nombres dans un ordre numerique et non lexicographique', () => {
    const names = ['page10.jpg', 'page2.jpg', 'page1.jpg']
    expect([...names].sort(naturalCompare)).toEqual(['page1.jpg', 'page2.jpg', 'page10.jpg'])
  })

  it('ignore la casse', () => {
    expect(naturalCompare('PAGE1.jpg', 'page1.jpg')).toBe(0)
  })
})

describe('filterAndSortEntries', () => {
  const entry = (name, dir = false) => ({ name, dir })

  it('ne garde que les images, dans l\'ordre naturel', () => {
    const entries = [
      entry('chapitre/page10.png'),
      entry('chapitre/page2.jpg'),
      entry('chapitre/page1.jpeg'),
      entry('chapitre/notes.txt'),
    ]
    expect(filterAndSortEntries(entries).map((e) => e.name)).toEqual([
      'chapitre/page1.jpeg',
      'chapitre/page2.jpg',
      'chapitre/page10.png',
    ])
  })

  it('exclut les dossiers, fichiers caches et artefacts __MACOSX', () => {
    const entries = [
      entry('chapitre/', true),
      entry('chapitre/.hidden.jpg'),
      entry('__MACOSX/chapitre/page1.jpg'),
      entry('chapitre/page1.jpg'),
    ]
    expect(filterAndSortEntries(entries).map((e) => e.name)).toEqual(['chapitre/page1.jpg'])
  })

  it('accepte plusieurs extensions d\'image courantes', () => {
    const entries = ['a.jpg', 'b.jpeg', 'c.png', 'd.gif', 'e.webp', 'f.avif', 'g.bmp', 'h.txt']
      .map((name) => entry(name))
    expect(filterAndSortEntries(entries).map((e) => e.name)).toEqual([
      'a.jpg', 'b.jpeg', 'c.png', 'd.gif', 'e.webp', 'f.avif', 'g.bmp',
    ])
  })
})
