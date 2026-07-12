import { describe, expect, it } from 'vitest'
import { findNextVolume, normalizeName, parseSeries, seriesKey } from './series.js'

describe('parseSeries', () => {
  it.each([
    ['One Piece - Tome 12', 'One Piece', 12],
    ['One Piece Tome 108', 'One Piece', 108],
    ['Naruto vol.45', 'Naruto', 45],
    ['Naruto volume-11', 'Naruto', 11],
    ['Berserk #38', 'Berserk', 38],
    ['Berserk T3', 'Berserk', 3],
    ['Bleach 07', 'Bleach', 7],
    ['Vinland Saga 12', 'Vinland Saga', 12],
    ['Gloutons & Dragons', 'Gloutons & Dragons', null],
    ['Akira', 'Akira', null],
    ['One Piece - Tome 12 (1)', 'One Piece', 12],
    ['One Piece Tome 5 (2)', 'One Piece', 5],
  ])('parses "%s"', (stem, expectedName, expectedVol) => {
    const [name, vol] = parseSeries(stem)
    expect(vol).toBe(expectedVol)
    if (expectedName !== null) expect(name).toBe(expectedName)
  })

  it('strips leading zeros', () => {
    expect(parseSeries('Naruto Tome 007')[1]).toBe(7)
  })

  it.each([
    ['Berserk T37 (Miura) (2019-2023) [Manga FR] (PapriKa+)', 'Berserk', 37],
    ['Choujin X T06 (Glenat) [NEO RIP-Club]', 'Choujin X', 6],
    ['20th Century Boys - Tome 1 [Manga FR] (CrossRead+)', '20th Century Boys', 1],
    ['Berserk_T41', 'Berserk', 41],
    ['Berserk Volume 42', 'Berserk', 42],
    ['Erased 01 (Kei SANBE) [Digital-1920]', 'Erased', 1],
    ['Erased 07 (Kei SANBE) [Digital-1920]', 'Erased', 7],
    ['[Oshi no Ko] T03', '[Oshi no Ko]', 3],
    ['Blame Master Edition 2020', null, null],
    ['Choujin X T07 - Tome 7 [1920px] [NEO RIP-Club]', 'Choujin X', 7],
    ['Area 51 - Tome 3', 'Area 51', 3],
    ['Monster - Intégrale Deluxe T06 (Urasawa) (2011) [Digital-2000] [Manga FR] (TONER-PapriKa+)', 'Monster', 6],
    ['Blade Runner Deluxe Edition T01', 'Blade Runner', 1],
    ['Berserk Chapitre 383', 'Berserk', 383],
    ['Berserk_ch0364[FR][FM][TEAM]', 'Berserk', 364],
    ['One Piece chap 1001', 'One Piece', 1001],
    ['Parasite - Édition originale T01 (Iwaaki) (2020) [Digital-1699] [Manga FR] (PapriKa+)', 'Parasite', 1],
    ['One Piece Édition originale T105', 'One Piece', 105],
    ['Naruto Édition Collector T12', 'Naruto', 12],
    ['Fruits Basket Edition Couleur T03', 'Fruits Basket', 3],
    ['Slam Dunk Perfect Edition T01', 'Slam Dunk', 1],
    ['Berserk Kanzenban T01', 'Berserk', 1],
    ['Perfect World T01', 'Perfect World', 1],
    ['Master Keaton T05', 'Master Keaton', 5],
    ['Cardcaptor Sakura - Clear Card T01', 'Cardcaptor Sakura - Clear Card', 1],
    ['Chainsaw_Man_T01_French', 'Chainsaw Man', 1],
    ['One Piece Tome 5 VF', 'One Piece', 5],
    ['Naruto T02 VOSTFR', 'Naruto', 2],
  ])('handles release junk in "%s"', (stem, expectedName, expectedVol) => {
    const [name, vol] = parseSeries(stem)
    expect(vol).toBe(expectedVol)
    if (expectedName !== null) expect(name).toBe(expectedName)
  })
})

describe('series grouping', () => {
  it('shares the same key across release-name variants', () => {
    const variants = [
      'Berserk T37 (Miura) (2019-2023) [Manga FR] (PapriKa+)',
      'Berserk_T41',
      'Berserk Volume 42',
      'Berserk #38',
      'berserk-t39',
    ]
    const keys = new Set(variants.map(seriesKey))
    expect(keys).toEqual(new Set(['berserk']))
  })

  it('does not split a series on a language tag', () => {
    expect(seriesKey('Chainsaw_Man_T01_French')).toBe(seriesKey('Chainsaw Man 12'))
  })

  it.each([
    ['Gloutons & Dragons', 'gloutons-dragons'],
    ['One_Piece', 'one piece'],
    ['  Naruto  ', 'naruto'],
    ["L'Attaque des Titans", 'l attaque des titans'],
  ])('normalizes "%s" and "%s" to the same key', (a, b) => {
    expect(normalizeName(a)).toBe(normalizeName(b))
  })
})

describe('findNextVolume', () => {
  it('finds the next volume among siblings', () => {
    const siblings = ['One Piece - Tome 1', 'One Piece - Tome 2', 'One Piece - Tome 3']
    expect(findNextVolume('One Piece - Tome 1', siblings)).toBe('One Piece - Tome 2')
  })

  it('returns null at the last volume', () => {
    const siblings = ['Naruto Tome 1', 'Naruto Tome 2']
    expect(findNextVolume('Naruto Tome 2', siblings)).toBeNull()
  })

  it('ignores other series', () => {
    const siblings = ['Naruto Tome 1', 'Bleach Tome 2']
    expect(findNextVolume('Naruto Tome 1', siblings)).toBeNull()
  })
})
