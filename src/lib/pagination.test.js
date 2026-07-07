import { describe, expect, it } from 'vitest'
import { isSpread, pairsWithNext, currentIndices, stepBack } from './pagination.js'

describe('isSpread', () => {
  it('considere une image plus large que haute comme une planche double', () => {
    expect(isSpread({ 0: 1.5 }, 0)).toBe(true)
  })
  it('ne considere pas une image portrait comme une planche double', () => {
    expect(isSpread({ 0: 0.7 }, 0)).toBe(false)
  })
  it('renvoie false quand le ratio est inconnu', () => {
    expect(isSpread({}, 0)).toBe(false)
  })
})

describe('pairsWithNext', () => {
  const ratios = { 0: 0.7, 1: 0.7, 2: 0.7, 3: 0.7 }
  const state = { doublePage: true, total: 4, pageOffset: 0 }

  it('couple les pages paires avec la suivante en mode double page', () => {
    expect(pairsWithNext(ratios, state, 0)).toBe(true)
    expect(pairsWithNext(ratios, state, 1)).toBe(false)
  })

  it('ne couple jamais en mode simple page', () => {
    expect(pairsWithNext(ratios, { ...state, doublePage: false }, 0)).toBe(false)
  })

  it('ne couple pas la derniere page seule', () => {
    expect(pairsWithNext(ratios, state, 3)).toBe(false)
  })

  it('ne couple jamais une planche double (image large)', () => {
    const spreadRatios = { 0: 1.4, 1: 0.7, 2: 0.7, 3: 0.7 }
    expect(pairsWithNext(spreadRatios, state, 0)).toBe(false)
  })

  it('decale la parite des paires quand pageOffset vaut 1', () => {
    const shifted = { ...state, pageOffset: 1 }
    expect(pairsWithNext(ratios, shifted, 0)).toBe(false)
    expect(pairsWithNext(ratios, shifted, 1)).toBe(true)
  })
})

describe('currentIndices', () => {
  const ratios = { 0: 0.7, 1: 0.7, 2: 0.7, 3: 0.7 }
  const state = { doublePage: true, total: 4, pageOffset: 0 }

  it('renvoie une paire quand les pages sont couplees', () => {
    expect(currentIndices(ratios, state, 0)).toEqual([0, 1])
  })

  it('renvoie une seule page quand elle n\'est pas couplee', () => {
    expect(currentIndices(ratios, state, 1)).toEqual([1])
  })
})

describe('stepBack', () => {
  const ratios = { 0: 0.7, 1: 0.7, 2: 0.7, 3: 0.7 }

  it('recule d\'une seule page en mode simple page', () => {
    expect(stepBack(ratios, { doublePage: false, index: 3, total: 4, pageOffset: 0 })).toBe(1)
  })

  it('recule d\'une page quand on revient vers la couverture', () => {
    expect(stepBack(ratios, { doublePage: true, index: 1, total: 4, pageOffset: 0 })).toBe(1)
  })

  it('recule de deux pages pour revenir sur la paire precedente', () => {
    expect(stepBack(ratios, { doublePage: true, index: 2, total: 4, pageOffset: 0 })).toBe(2)
  })
})
