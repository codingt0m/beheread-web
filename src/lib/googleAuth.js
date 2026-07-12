// Google sign-in for Drive access, using Google Identity Services (GIS) -
// the current replacement for the old gapi auth2 client. Scopes:
//
// - drive.readonly : read-only access to the user's Drive, INCLUDING files
//                    shared with them. Needed because the narrower
//                    drive.file scope grants access to a picked folder but
//                    does NOT return that folder's contents via files.list
//                    (verified empirically: empty listing) - and because a
//                    friend must be able to read a folder the owner shared
//                    with them. The app never writes to or deletes the
//                    user's manga files (read-only).
// - drive.appdata  : a per-user, hidden application folder for settings/
//                    progress/metadata cache (mirrors storage.py's local
//                    JSON files, just in the cloud). Read+write, but scoped
//                    to the app's own hidden folder only.
//
// Requires a Google Cloud OAuth Client ID (VITE_GOOGLE_CLIENT_ID) - see
// README for the one-time Google Cloud Console setup.
const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
].join(' ')

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const TOKEN_STORAGE_KEY = 'beheread-web:drive-token'
const EXPIRY_SAFETY_MARGIN_MS = 60_000

let tokenClient = null
let gisLoadPromise = null
let current = null // { accessToken, expiresAt }

export function isConfigured() {
  return Boolean(CLIENT_ID)
}

function loadGis() {
  if (gisLoadPromise) return gisLoadPromise
  gisLoadPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Impossible de charger Google Identity Services.'))
    document.head.appendChild(script)
  })
  return gisLoadPromise
}

function readStoredToken() {
  try {
    const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.accessToken || !parsed?.expiresAt || parsed.expiresAt < Date.now()) return null
    return parsed
  } catch {
    return null
  }
}

function storeToken(accessToken, expiresInSeconds) {
  const expiresAt = Date.now() + expiresInSeconds * 1000 - EXPIRY_SAFETY_MARGIN_MS
  const entry = { accessToken, expiresAt }
  try {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(entry))
  } catch {
    /* private browsing: token just won't survive a reload */
  }
  return entry
}

export function getAccessToken() {
  if (current && current.expiresAt > Date.now()) return current.accessToken
  const stored = readStoredToken()
  if (stored) {
    current = stored
    return stored.accessToken
  }
  current = null
  return null
}

async function ensureTokenClient() {
  await loadGis()
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: () => {}, // replaced per-call in signIn()
    })
  }
  return tokenClient
}

// Requests an access token. `interactive: false` attempts a silent grant
// (no popup) for a returning user with a live Google session and prior
// consent - used on page load so sign-in isn't asked for every visit.
export function signIn({ interactive = true } = {}) {
  if (!isConfigured()) {
    return Promise.reject(
      new Error('VITE_GOOGLE_CLIENT_ID manquant : configuration Google Cloud requise (voir README).'),
    )
  }
  return ensureTokenClient().then(
    (client) =>
      new Promise((resolve, reject) => {
        client.callback = (resp) => {
          if (resp.error) {
            reject(new Error(resp.error))
            return
          }
          current = storeToken(resp.access_token, resp.expires_in)
          resolve(current.accessToken)
        }
        client.error_callback = (err) => reject(new Error(err?.message || 'Connexion Google annulee.'))
        client.requestAccessToken({ prompt: interactive ? 'consent' : '' })
      }),
  )
}

export function signOut() {
  const token = getAccessToken()
  current = null
  try {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch {
    /* ignore */
  }
  if (token && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(token, () => {})
  }
}

export async function trySilentSignIn() {
  const existing = getAccessToken()
  if (existing) return existing
  if (!isConfigured()) return null
  try {
    return await signIn({ interactive: false })
  } catch {
    return null
  }
}
