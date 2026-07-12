// Ratcliff/Obershelp string similarity (same algorithm as Python's
// difflib.SequenceMatcher.ratio, used by the desktop app's metadata source
// clients to score title matches). Recursive longest-common-substring; fine
// for the short title strings these clients compare.

function matchingChars(a, b) {
  if (!a.length || !b.length) return 0
  let bestLen = 0
  let bestI = 0
  let bestJ = 0
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      let k = 0
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++
      if (k > bestLen) {
        bestLen = k
        bestI = i
        bestJ = j
      }
    }
  }
  if (bestLen === 0) return 0
  return (
    bestLen +
    matchingChars(a.slice(0, bestI), b.slice(0, bestJ)) +
    matchingChars(a.slice(bestI + bestLen), b.slice(bestJ + bestLen))
  )
}

export function sequenceRatio(a, b) {
  if (!a.length && !b.length) return 1
  const m = matchingChars(a, b)
  return (2 * m) / (a.length + b.length)
}
