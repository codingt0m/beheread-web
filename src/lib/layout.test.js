import { describe, expect, it } from 'vitest'
import { FIT_WIDTH, FIT_HEIGHT, FIT_WINDOW, computeLayout, clampPan } from './layout.js'

const baseArgs = {
  indices: [0],
  ratios: { 0: 1 }, // image carree
  pages: ['blob:0'],
  mangaMode: false,
  fitMode: FIT_WINDOW,
  zoom: 1,
  stageSize: { w: 800, h: 400 },
}

describe('computeLayout', () => {
  it('renvoie null tant que les ratios necessaires manquent', () => {
    expect(computeLayout({ ...baseArgs, ratios: {} })).toBeNull()
  })

  it('renvoie null tant que la zone d\'affichage n\'est pas mesuree', () => {
    expect(computeLayout({ ...baseArgs, stageSize: { w: 0, h: 0 } })).toBeNull()
  })

  it('ajuste a la fenetre : limite par la plus petite dimension', () => {
    const layout = computeLayout(baseArgs)
    // image carree (r=1) dans un cadre 800x400 -> hauteur limitee a 400
    expect(layout.sized[0].h).toBe(400)
    expect(layout.sized[0].w).toBe(400)
  })

  it('ajuste a la largeur', () => {
    const layout = computeLayout({ ...baseArgs, fitMode: FIT_WIDTH })
    expect(layout.sized[0].w).toBe(800)
    expect(layout.sized[0].h).toBe(800)
  })

  it('ajuste a la hauteur', () => {
    const layout = computeLayout({ ...baseArgs, fitMode: FIT_HEIGHT })
    expect(layout.sized[0].h).toBe(400)
  })

  it('applique le zoom', () => {
    const layout = computeLayout({ ...baseArgs, zoom: 2 })
    expect(layout.sized[0].h).toBe(800)
  })

  it('inverse l\'ordre des deux pages en mode manga (droite a gauche)', () => {
    const layout = computeLayout({
      ...baseArgs,
      indices: [0, 1],
      ratios: { 0: 0.7, 1: 0.7 },
      pages: ['blob:0', 'blob:1'],
      mangaMode: true,
    })
    expect(layout.sized.map((it) => it.i)).toEqual([1, 0])
  })

  it('calcule le debordement horizontal/vertical', () => {
    const layout = computeLayout({ ...baseArgs, fitMode: FIT_WIDTH })
    expect(layout.overflowX).toBe(0)
    expect(layout.overflowY).toBe(400) // 800 de haut pour un cadre de 400
  })
})

describe('clampPan', () => {
  it('renvoie {0,0} sans layout', () => {
    expect(clampPan(null, 50, 50)).toEqual({ x: 0, y: 0 })
  })

  it('limite le pan a la moitie du debordement', () => {
    const layout = { overflowX: 100, overflowY: 20 }
    expect(clampPan(layout, 1000, 1000)).toEqual({ x: 50, y: 10 })
    expect(clampPan(layout, -1000, -1000)).toEqual({ x: -50, y: -10 })
    expect(clampPan(layout, 10, 5)).toEqual({ x: 10, y: 5 })
  })
})
