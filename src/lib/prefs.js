const PREFS_KEY = 'beheread-web:prefs'

export function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}
  } catch {
    return {}
  }
}

export function savePrefs(prefs) {
  // Safari en navigation privee peut lever une exception sur setItem
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}
