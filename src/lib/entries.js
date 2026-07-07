// Extensions d'images reconnues a l'interieur de l'archive .cbz
export const IMAGE_RE = /\.(jpe?g|png|gif|webp|avif|bmp)$/i

// Tri "naturel" : page2.jpg passe bien AVANT page10.jpg
export function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

// Garde uniquement les images utiles (pas les dossiers, fichiers caches ou
// artefacts macOS) et les trie dans l'ordre naturel des pages.
export function filterAndSortEntries(entries) {
  return entries
    .filter(
      (e) =>
        !e.dir &&
        IMAGE_RE.test(e.name) &&
        !e.name.split('/').pop().startsWith('.') &&
        !e.name.startsWith('__MACOSX'),
    )
    .sort((a, b) => naturalCompare(a.name, b.name))
}
