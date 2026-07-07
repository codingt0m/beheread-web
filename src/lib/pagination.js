// Une "planche double" est une image plus large que haute (ratio > 1) :
// elle occupe l'ecran seule, jamais couplee a sa voisine.
export function isSpread(ratios, i) {
  const r = ratios[i]
  return r != null && r > 1
}

// La page p forme-t-elle une paire avec p+1 ? Depend du decalage de parite
// (touche S) et des planches doubles (jamais couplees).
export function pairsWithNext(ratios, { doublePage, total, pageOffset }, p) {
  return (
    doublePage &&
    p >= 0 &&
    p + 1 < total &&
    !isSpread(ratios, p) &&
    !isSpread(ratios, p + 1) &&
    (p - pageOffset) % 2 === 0
  )
}

export function currentIndices(ratios, { doublePage, total, pageOffset }, index) {
  return pairsWithNext(ratios, { doublePage, total, pageOffset }, index)
    ? [index, index + 1]
    : [index]
}

// Nombre de pages a reculer depuis `index` pour revenir a la planche/paire
// precedente.
export function stepBack(ratios, { doublePage, index, total, pageOffset }) {
  if (!doublePage) return 1
  const p = index - 1
  if (p <= 0) return 1
  if (pairsWithNext(ratios, { doublePage, total, pageOffset }, p - 1)) return 2
  return 1
}
