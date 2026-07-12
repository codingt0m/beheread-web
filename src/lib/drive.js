// Thin Google Drive REST v3 client: listing a library folder, downloading
// archives, and reading/writing the app's private appDataFolder (the cloud
// equivalent of storage.py's local JSON files). No SDK dependency - plain
// fetch, since the browser already handles CORS fine for Drive's API.
const FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files'

// Web build only ships JSZip, so only these formats can actually be opened
// in-browser (unlike the desktop app, which also supports CBR/RAR via an
// external unrar tool - there is no practical pure-JS unrar equivalent).
const ARCHIVE_EXT_RE = /\.(cbz|zip|epub)$/i
const FOLDER_MIME = 'application/vnd.google-apps.folder'

export class DriveError extends Error {}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` }
}

async function driveFetch(url, token, init) {
  const res = await fetch(url, { ...init, headers: { ...authHeaders(token), ...init?.headers } })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new DriveError(`Requete Drive echouee (${res.status}) : ${body.slice(0, 200)}`)
  }
  return res
}

function escapeQueryValue(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

export async function listChildren(token, folderId) {
  const files = []
  let pageToken
  do {
    const params = new URLSearchParams({
      q: `'${escapeQueryValue(folderId)}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id,name,mimeType,size,modifiedTime,md5Checksum)',
      pageSize: '1000',
      spaces: 'drive',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const res = await driveFetch(`${FILES_URL}?${params}`, token)
    const payload = await res.json()
    files.push(...(payload.files || []))
    pageToken = payload.nextPageToken
  } while (pageToken)
  return files
}

// Walks a Drive folder tree breadth-first, collecting supported archive
// files. Each entry keeps its immediate parentId so callers can group
// "siblings" the same way the desktop app groups files within one disk
// folder (series grouping / next-volume detection).
export async function scanFolderRecursive(token, rootFolderId, { onProgress } = {}) {
  const archives = []
  const queue = [rootFolderId]
  while (queue.length > 0) {
    const folderId = queue.shift()
    const children = await listChildren(token, folderId)
    for (const f of children) {
      if (f.mimeType === FOLDER_MIME) {
        queue.push(f.id)
      } else if (ARCHIVE_EXT_RE.test(f.name)) {
        archives.push({ ...f, parentId: folderId })
        onProgress?.(archives.length)
      }
    }
  }
  return archives
}

// Downloads a file's bytes. If `onProgress` is given, streams the response
// and reports (receivedBytes, totalBytes) as chunks arrive - totalBytes is 0
// when Drive doesn't expose Content-Length over CORS, in which case callers
// should show an indeterminate state and rely on receivedBytes only.
export async function downloadFile(token, fileId, onProgress) {
  const res = await driveFetch(`${FILES_URL}/${fileId}?alt=media`, token)
  if (!onProgress || !res.body) return res.arrayBuffer()

  const total = Number(res.headers.get('Content-Length')) || 0
  const reader = res.body.getReader()
  const chunks = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    onProgress(received, total)
  }

  const out = new Uint8Array(received)
  let pos = 0
  for (const chunk of chunks) {
    out.set(chunk, pos)
    pos += chunk.length
  }
  return out.buffer
}

async function findAppDataFileId(token, name) {
  const params = new URLSearchParams({
    q: `name = '${escapeQueryValue(name)}' and trashed = false`,
    spaces: 'appDataFolder',
    fields: 'files(id,name,modifiedTime)',
  })
  const res = await driveFetch(`${FILES_URL}?${params}`, token)
  const payload = await res.json()
  return payload.files?.[0]?.id ?? null
}

export async function readAppDataJSON(token, name, defaultValue) {
  const id = await findAppDataFileId(token, name)
  if (!id) return defaultValue
  const res = await driveFetch(`${FILES_URL}/${id}?alt=media`, token)
  try {
    return await res.json()
  } catch {
    return defaultValue
  }
}

export async function writeAppDataJSON(token, name, data) {
  const id = await findAppDataFileId(token, name)
  const metadata = id ? {} : { name, parents: ['appDataFolder'] }
  const boundary = `beheread-${Math.random().toString(36).slice(2)}`
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: application/json\r\n\r\n' +
    `${JSON.stringify(data)}\r\n` +
    `--${boundary}--`

  const url = id ? `${UPLOAD_URL}/${id}?uploadType=multipart` : `${UPLOAD_URL}?uploadType=multipart`
  const res = await driveFetch(url, token, {
    method: id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  return res.json()
}

let pickerApiLoadPromise = null

function loadPickerApi() {
  if (pickerApiLoadPromise) return pickerApiLoadPromise
  pickerApiLoadPromise = new Promise((resolve, reject) => {
    if (window.google?.picker) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/api.js'
    script.onload = () => {
      window.gapi.load('picker', {
        callback: resolve,
        onerror: () => reject(new Error('Chargement du selecteur Google Drive echoue.')),
      })
    }
    script.onerror = () => reject(new Error('Chargement de apis.google.com echoue.'))
    document.head.appendChild(script)
  })
  return pickerApiLoadPromise
}

// Opens Google's folder picker so the user chooses their manga library
// folder in Drive - the web equivalent of the desktop app's folder-manager
// dialog. Two tabs are offered: folders the user owns ("My Drive") and
// folders shared with them ("Shared with me") - the latter is what lets a
// friend select a library folder another user shared with them. Requires a
// separate Google API key (VITE_GOOGLE_API_KEY, distinct from the OAuth
// client ID) - see README.
export async function pickFolder({ token, apiKey }) {
  await loadPickerApi()
  return new Promise((resolve, reject) => {
    if (!apiKey) {
      reject(new Error('VITE_GOOGLE_API_KEY manquant : configuration Google Cloud requise (voir README).'))
      return
    }
    const { google } = window
    const myDriveView = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
      .setSelectFolderEnabled(true)
      .setIncludeFolders(true)
      .setOwnedByMe(true)
    // setOwnedByMe(false) restreint la vue aux elements partages avec
    // l'utilisateur ("Partages avec moi"), d'ou un ami peut selectionner le
    // dossier que le proprietaire lui a partage.
    const sharedView = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
      .setSelectFolderEnabled(true)
      .setIncludeFolders(true)
      .setOwnedByMe(false)
    const picker = new google.picker.PickerBuilder()
      .addView(myDriveView)
      .addView(sharedView)
      .setOAuthToken(token)
      .setDeveloperKey(apiKey)
      // setOrigin explicite : sans lui, le message de retour du Picker (clic
      // "Select") peut ne jamais revenir a la fenetre appelante quand il
      // s'affiche en fenetre separee -> "Select" semble ne rien faire.
      .setOrigin(window.location.origin)
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) {
          const doc = data.docs[0]
          resolve({ id: doc.id, name: doc.name })
        } else if (data.action === google.picker.Action.CANCEL) {
          resolve(null)
        }
      })
      .build()
    picker.setVisible(true)
  })
}
