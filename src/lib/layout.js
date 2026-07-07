export const FIT_WINDOW = 0
export const FIT_WIDTH = 1
export const FIT_HEIGHT = 2
export const FIT_NAMES = {
  [FIT_WINDOW]: 'Ajuster a la fenetre',
  [FIT_WIDTH]: 'Ajuster a la largeur',
  [FIT_HEIGHT]: 'Ajuster a la hauteur',
}

// Calcule la taille et la position des 1 ou 2 pages affichees, en fonction
// du mode d'ajustement, du zoom et de la taille de la zone d'affichage.
// Retourne `null` tant que les ratios necessaires ne sont pas connus.
export function computeLayout({ indices, ratios, pages, mangaMode, fitMode, zoom, stageSize }) {
  const displayReady = indices.every((i) => ratios[i] != null)
  if (!displayReady || stageSize.w <= 0 || stageSize.h <= 0) return null

  const vw = stageSize.w
  const vh = stageSize.h
  let items = indices.map((i) => ({ i, r: ratios[i], src: pages[i] }))
  if (mangaMode && items.length === 2) items = [items[1], items[0]] // RTL

  const rsum = items.reduce((s, it) => s + it.r, 0)
  let h
  if (fitMode === FIT_WIDTH) h = vw / rsum
  else if (fitMode === FIT_HEIGHT) h = vh
  else h = Math.min(vh, vw / rsum)
  h *= zoom

  const sized = items.map((it) => ({ ...it, w: h * it.r, h }))
  const totalW = sized.reduce((s, it) => s + it.w, 0)
  return {
    sized,
    overflowX: Math.max(0, totalW - vw),
    overflowY: Math.max(0, h - vh),
  }
}

export function clampPan(layout, x, y) {
  if (!layout) return { x: 0, y: 0 }
  const mx = layout.overflowX / 2
  const my = layout.overflowY / 2
  return {
    x: Math.max(-mx, Math.min(mx, x)),
    y: Math.max(-my, Math.min(my, y)),
  }
}
