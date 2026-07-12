import { useCallback, useEffect, useMemo, useState } from 'react'
import { pickFolder, scanFolderRecursive } from './lib/drive.js'
import { clearArchiveCache, getCachedKeys, getOrDownloadArchive } from './lib/archiveCache.js'
import { buildLibraryEntries, filterEntries, groupBySeries } from './lib/libraryDrive.js'
import { fetchSeries, isStaleNotFound } from './lib/metadata.js'

const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY

// The web build has no way to generate cover thumbnails without downloading
// each archive (unlike the desktop app, which extracts the first page
// during its local disk scan) - so entries show a placeholder + title/author
// instead of a cover. A future serverless thumbnail cache could close this
// gap; out of scope for now (see README).
function EntryCover({ entry, seriesMeta, isCached }) {
  const label = entry.volume != null ? `T.${entry.volume}` : ''
  return (
    <div className="entry-cover">
      {isCached && (
        <span className="entry-cached-badge" title="Disponible hors-ligne (en cache local)">
          ✓ Hors-ligne
        </span>
      )}
      <span className="entry-cover-label">{label}</span>
      {seriesMeta?.authors?.[0] && <span className="entry-cover-author">{seriesMeta.authors[0]}</span>}
    </div>
  )
}

function ProgressBar({ progress }) {
  if (!progress || !progress.total) return null
  const pct = progress.finished ? 100 : Math.round(((progress.page + 1) / progress.total) * 100)
  return (
    <div className="entry-progress" title={`${pct}%`}>
      <div className="entry-progress-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

// A single clickable volume tile. While it is being downloaded, its reading-
// progress bar is replaced by a download bar: determinate (percentage) when
// Drive exposes Content-Length, otherwise indeterminate with the number of
// MB received so far.
function EntryButton({ entry, isOpening, isCached, download, seriesMeta, onOpen }) {
  const pct = download?.total ? Math.round((download.received / download.total) * 100) : null
  const mb = download ? (download.received / (1024 * 1024)).toFixed(1) : '0'
  return (
    <button
      className="entry"
      disabled={isOpening}
      onClick={() => onOpen(entry)}
      title={entry.name}
    >
      <EntryCover entry={entry} seriesMeta={seriesMeta} isCached={isCached} />
      {isOpening ? (
        <div className={`entry-download${pct == null ? ' indeterminate' : ''}`}>
          <div className="entry-download-fill" style={pct == null ? undefined : { width: `${pct}%` }} />
        </div>
      ) : (
        <ProgressBar progress={entry.progress} />
      )}
      <span className="entry-name">
        {isOpening
          ? (pct != null ? `Telechargement ${pct}%` : `Telechargement ${mb} Mo`)
          : entry.name}
      </span>
    </button>
  )
}

export default function Library({ store, token, onOpenEntry, onSignOut }) {
  const [folder, setFolder] = useState(store.libraryFolder())
  const [files, setFiles] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [scanCount, setScanCount] = useState(0)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [grouped, setGrouped] = useState(true)
  const [opening, setOpening] = useState(null) // entry id currently being downloaded
  const [download, setDownload] = useState(null) // { received, total } for the entry being downloaded
  const [cachedKeys, setCachedKeys] = useState(() => new Set()) // content keys available offline
  const [metaTick, setMetaTick] = useState(0) // bumped to re-render as series metadata trickles in

  const refreshCachedKeys = useCallback(async () => {
    setCachedKeys(new Set(await getCachedKeys()))
  }, [])

  useEffect(() => { refreshCachedKeys() }, [refreshCachedKeys])

  const handleClearCache = useCallback(async () => {
    await clearArchiveCache()
    refreshCachedKeys()
  }, [refreshCachedKeys])

  const scan = useCallback(async (folderToScan) => {
    setScanning(true)
    setError('')
    setScanCount(0)
    try {
      const found = await scanFolderRecursive(token, folderToScan.id, {
        onProgress: setScanCount,
      })
      setFiles(found)
    } catch (e) {
      setError(e.message || 'Analyse du dossier Drive impossible.')
    } finally {
      setScanning(false)
    }
  }, [token])

  useEffect(() => {
    if (folder) scan(folder)
  }, [folder, scan])

  const handleChooseFolder = useCallback(async () => {
    setError('')
    try {
      const picked = await pickFolder({ token, apiKey: API_KEY })
      if (!picked) return
      await store.setLibraryFolder(picked)
      setFolder(picked)
    } catch (e) {
      setError(e.message || 'Selection du dossier Drive impossible.')
    }
  }, [token, store])

  const entries = useMemo(
    () => (files ? buildLibraryEntries(files, store) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [files, store, metaTick],
  )
  const filtered = useMemo(() => filterEntries(entries, query), [entries, query])
  const groups = useMemo(() => groupBySeries(filtered), [filtered])

  // Best-effort series metadata enrichment (author/year), one series at a
  // time so as not to burst the free AniList/MangaDex quotas. Series-level
  // only, on purpose: fetching per-volume metadata (ComicInfo.xml/Google
  // Books) would mean downloading every archive just to list the library,
  // which the desktop app never has to pay for (its files are already on
  // local disk).
  useEffect(() => {
    if (entries.length === 0) return
    let cancelled = false
    const seriesNames = [...new Map(entries.map((e) => [e.seriesKeyNorm, e.seriesName])).entries()]

    ;(async () => {
      for (const [key, name] of seriesNames) {
        if (cancelled) return
        const cached = store.seriesMeta(key)
        if (cached && !isStaleNotFound(cached)) continue
        try {
          const [data] = await fetchSeries(name)
          if (cancelled) return
          if (data) {
            store.setSeriesMeta(key, data)
            setMetaTick((t) => t + 1)
          }
        } catch {
          // best-effort only: a failed lookup just leaves the placeholder
        }
      }
    })()

    return () => { cancelled = true }
  }, [entries, store])

  const handleOpen = useCallback(async (entry) => {
    setOpening(entry.id)
    setDownload({ received: 0, total: 0 })
    setError('')
    try {
      const buffer = await getOrDownloadArchive(token, entry, (received, total) => {
        setDownload({ received, total })
      })
      onOpenEntry(entry, new Blob([buffer]), entries)
    } catch (e) {
      setError(e.message || `Telechargement de "${entry.name}" impossible.`)
    } finally {
      setOpening(null)
      setDownload(null)
      refreshCachedKeys() // the cache set may have changed (added / LRU-evicted)
    }
  }, [token, onOpenEntry, entries, refreshCachedKeys])

  return (
    <div className="library">
      <header className="library-header">
        <h1>Beheread <span className="badge">Web</span></h1>
        <div className="library-actions">
          <input
            className="library-search"
            type="search"
            placeholder="Rechercher une serie..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            className="ghost"
            onClick={() => folder && scan(folder)}
            disabled={!folder || scanning}
            title="Re-analyser le dossier Drive (nouveaux fichiers, changements)"
          >
            {scanning ? 'Analyse...' : 'Rafraichir'}
          </button>
          <button
            className="ghost"
            onClick={handleClearCache}
            disabled={cachedKeys.size === 0}
            title="Supprimer les tomes stockes localement (ils restent sur Drive)"
          >
            Vider le hors-ligne{cachedKeys.size > 0 ? ` (${cachedKeys.size})` : ''}
          </button>
          <button className="ghost" onClick={() => setGrouped((g) => !g)}>
            {grouped ? 'Vue a plat' : 'Grouper par serie'}
          </button>
          <button className="ghost" onClick={handleChooseFolder}>
            {folder ? 'Changer de dossier' : 'Choisir un dossier Drive'}
          </button>
          <button className="ghost" onClick={onSignOut}>Deconnexion</button>
        </div>
      </header>

      {folder && <p className="hint">Dossier : {folder.name}</p>}
      {error && <p className="error">{error}</p>}

      {!folder && !error && (
        <p className="hint">Choisissez le dossier Drive contenant vos fichiers .cbz/.zip/.epub.</p>
      )}

      {scanning && (
        <p className="subtitle">Analyse du dossier Drive... {scanCount} fichier(s) trouve(s)</p>
      )}

      {!scanning && folder && filtered.length === 0 && files && (
        <p className="hint">Aucun fichier .cbz/.zip/.epub trouve dans ce dossier.</p>
      )}

      {!scanning && grouped && (
        <div className="library-groups">
          {groups.map((g) => (
            <section key={g.seriesKey} className="library-group">
              <h2>
                {g.seriesName}
                {store.seriesMeta(g.seriesKey)?.authors?.[0] && (
                  <span className="series-author"> — {store.seriesMeta(g.seriesKey).authors[0]}</span>
                )}
              </h2>
              <div className="library-grid">
                {g.items.map((entry) => (
                  <EntryButton
                    key={entry.id}
                    entry={entry}
                    isOpening={opening === entry.id}
                    isCached={cachedKeys.has(entry.contentKey)}
                    download={opening === entry.id ? download : null}
                    seriesMeta={store.seriesMeta(entry.seriesKeyNorm)}
                    onOpen={handleOpen}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {!scanning && !grouped && (
        <div className="library-grid">
          {filtered.map((entry) => (
            <EntryButton
              key={entry.id}
              entry={entry}
              isOpening={opening === entry.id}
              isCached={cachedKeys.has(entry.contentKey)}
              download={opening === entry.id ? download : null}
              seriesMeta={store.seriesMeta(entry.seriesKeyNorm)}
              onOpen={handleOpen}
            />
          ))}
        </div>
      )}
    </div>
  )
}
