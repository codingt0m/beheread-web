import { useCallback, useEffect, useState } from 'react'
import Reader from './Reader.jsx'
import Library from './Library.jsx'
import { getOrDownloadArchive } from './lib/archiveCache.js'
import { getAccessToken, isConfigured, signIn, signOut, trySilentSignIn } from './lib/googleAuth.js'
import { nextVolumeEntry } from './lib/libraryDrive.js'
import { Store } from './lib/store.js'

// Top-level screen chooser: a local file (the original, unchanged
// experience - no Drive, no account) or a Google Drive-backed library that
// persists progress/metadata across devices. `mode` picks between them;
// `driveScreen` then switches between the library grid and the reader once
// signed in.
export default function App() {
  const [mode, setMode] = useState('checking') // checking | chooser | local | drive
  const [driveScreen, setDriveScreen] = useState('library') // library | reader
  const [store, setStore] = useState(null)
  const [token, setToken] = useState(null)
  const [openEntry, setOpenEntry] = useState(null) // { entry, blob, allEntries }
  const [authError, setAuthError] = useState('')

  const enterDrive = useCallback(async (accessToken) => {
    setToken(accessToken)
    const s = new Store(() => getAccessToken())
    await s.init()
    setStore(s)
    setDriveScreen('library')
    setMode('drive')
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!isConfigured()) {
        if (!cancelled) setMode('chooser')
        return
      }
      const silentToken = await trySilentSignIn()
      if (cancelled) return
      if (silentToken) await enterDrive(silentToken)
      else setMode('chooser')
    })()
    return () => {
      cancelled = true
    }
  }, [enterDrive])

  const handleSignIn = useCallback(async () => {
    setAuthError('')
    try {
      const accessToken = await signIn({ interactive: true })
      await enterDrive(accessToken)
    } catch (e) {
      setAuthError(e.message || 'Connexion Google impossible.')
    }
  }, [enterDrive])

  const handleSignOut = useCallback(() => {
    signOut()
    setStore(null)
    setToken(null)
    setOpenEntry(null)
    setMode('chooser')
  }, [])

  const handleOpenEntry = useCallback((entry, blob, allEntries) => {
    setOpenEntry({ entry, blob, allEntries })
    setDriveScreen('reader')
  }, [])

  const handleReaderProgress = useCallback(
    (page, total, finished) => {
      store?.setProgress(openEntry.entry.contentKey, page, total, finished)
    },
    [store, openEntry],
  )

  const handleReaderClose = useCallback(() => {
    setOpenEntry(null)
    setDriveScreen('library')
  }, [])

  const handleRequestNext = useCallback(async () => {
    if (!openEntry?.allEntries) return
    const next = nextVolumeEntry(openEntry.entry, openEntry.allEntries)
    if (!next) return
    try {
      const buffer = await getOrDownloadArchive(token, next)
      setOpenEntry({ entry: next, blob: new Blob([buffer]), allEntries: openEntry.allEntries })
    } catch {
      /* network hiccup: stay on the current volume rather than crash */
    }
  }, [openEntry, token])

  if (mode === 'checking') {
    return (
      <div className="welcome">
        <p className="subtitle">Chargement...</p>
      </div>
    )
  }

  if (mode === 'chooser') {
    return (
      <div className="welcome">
        <img className="logo" src="/icon-256.png" alt="Beheread" />
        <h1>
          Beheread <span className="badge">Web</span>
        </h1>
        <p className="subtitle">
          Ouvrez un fichier .cbz local, ou connectez votre Google Drive pour retrouver votre
          bibliotheque et votre progression de lecture sur tous vos appareils.
        </p>
        <div className="chooser-actions">
          <button className="primary" onClick={() => setMode('local')}>
            Ouvrir un fichier local
          </button>
          {isConfigured() ? (
            <button className="ghost" onClick={handleSignIn}>
              Se connecter a Google Drive
            </button>
          ) : (
            <p className="hint">Connexion Google Drive non configuree (voir README).</p>
          )}
        </div>
        {authError && <p className="error">{authError}</p>}
      </div>
    )
  }

  if (mode === 'local') {
    return <Reader />
  }

  // mode === 'drive'
  if (!store) {
    return (
      <div className="welcome">
        <p className="subtitle">Chargement...</p>
      </div>
    )
  }

  if (driveScreen === 'library') {
    return <Library store={store} token={token} onOpenEntry={handleOpenEntry} onSignOut={handleSignOut} />
  }

  return (
    <Reader
      initialSource={{ id: openEntry.entry.id, name: openEntry.entry.name, blob: openEntry.blob }}
      initialPage={store.getProgress(openEntry.entry.contentKey)?.page ?? 0}
      onProgress={handleReaderProgress}
      onClose={handleReaderClose}
      onRequestNext={openEntry.allEntries ? handleRequestNext : undefined}
    />
  )
}
