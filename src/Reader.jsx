import { useCallback, useEffect, useRef, useState } from 'react'
import JSZip from 'jszip'
import { loadPrefs, savePrefs } from './lib/prefs.js'
import { filterAndSortEntries } from './lib/entries.js'
import { currentIndices as computeCurrentIndices, stepBack as computeStepBack } from './lib/pagination.js'
import { FIT_WINDOW, FIT_NAMES, computeLayout, clampPan as computeClampPan } from './lib/layout.js'

// ---- Plein ecran multi-navigateurs (Safari utilise les variantes webkit) ----
function fsElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null
}
function fsRequest(el) {
  const fn = el.requestFullscreen || el.webkitRequestFullscreen
  if (fn) fn.call(el)
}
function fsExit() {
  const fn = document.exitFullscreen || document.webkitExitFullscreen
  if (fn) fn.call(document)
}
function fsSupported() {
  const el = document.documentElement
  return !!(el.requestFullscreen || el.webkitRequestFullscreen)
}

export default function Reader() {
  const prefs = loadPrefs()

  const [pages, setPages] = useState([])   // tableau d'URLs blob (une par page)
  const [index, setIndex] = useState(0)    // page GAUCHE actuellement affichee
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  // Preferences persistantes (comme le Store du bureau)
  const [doublePage, setDoublePage] = useState(prefs.doublePage ?? true)
  const [mangaMode, setMangaMode] = useState(prefs.mangaMode ?? true)
  const [fitMode, setFitMode] = useState(prefs.fitMode ?? FIT_WINDOW)
  const [pageOffset, setPageOffset] = useState(prefs.pageOffset ?? 0)  // parite double page (0/1)

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [hudExtra, setHudExtra] = useState('')
  const [ratioTick, setRatioTick] = useState(0)  // force le recalcul quand un ratio arrive
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 })

  const inputRef = useRef(null)
  const stageRef = useRef(null)
  const pagesRef = useRef([])              // miroir de `pages` pour le nettoyage
  const ratiosRef = useRef({})             // index -> largeur/hauteur (detection planche double)
  const dragRef = useRef({ origin: null, dragged: false })

  const total = pages.length

  // Sauvegarde des preferences a chaque changement
  useEffect(() => {
    savePrefs({ doublePage, mangaMode, fitMode, pageOffset })
  }, [doublePage, mangaMode, fitMode, pageOffset])

  // ---- Libere la memoire : on revoque toutes les URLs blob ----
  const revokeAll = useCallback(() => {
    pagesRef.current.forEach((url) => URL.revokeObjectURL(url))
    pagesRef.current = []
    ratiosRef.current = {}
  }, [])

  useEffect(() => () => revokeAll(), [revokeAll])

  // ---- Ouverture et extraction du .cbz, 100% en memoire (aucun upload) ----
  const openFile = useCallback(async (file) => {
    if (!file) return
    setLoading(true)
    setError('')
    setProgress(0)
    try {
      const zip = await JSZip.loadAsync(file)
      const entries = filterAndSortEntries(Object.values(zip.files))

      if (entries.length === 0) {
        throw new Error('Aucune image trouvee dans ce fichier .cbz.')
      }

      const urls = []
      for (let i = 0; i < entries.length; i++) {
        const blob = await entries[i].async('blob')
        urls.push(URL.createObjectURL(blob))
        setProgress(Math.round(((i + 1) / entries.length) * 100))
      }

      revokeAll()
      pagesRef.current = urls
      setPages(urls)
      setIndex(0)
      setPan({ x: 0, y: 0 })
      setZoom(1)
      setHudExtra('')
      setFileName(file.name)
    } catch (err) {
      setError(err?.message || 'Fichier illisible ou corrompu.')
      setPages([])
    } finally {
      setLoading(false)
    }
  }, [revokeAll])

  const close = useCallback(() => {
    if (fsElement()) fsExit()
    revokeAll()
    setPages([])
    setIndex(0)
    setPan({ x: 0, y: 0 })
    setZoom(1)
    setFileName('')
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }, [revokeAll])

  // ---- Chargement des dimensions (ratio) pour la detection des planches doubles ----
  const loadRatio = useCallback((i) => new Promise((resolve) => {
    const url = pagesRef.current[i]
    if (!url || ratiosRef.current[i] != null) return resolve()
    const img = new Image()
    img.onload = () => { ratiosRef.current[i] = img.naturalWidth / img.naturalHeight; resolve() }
    img.onerror = () => { ratiosRef.current[i] = 0.7; resolve() }
    img.src = url
  }), [])

  // Priorite : les pages autour de la position courante, puis tout le reste en fond
  useEffect(() => {
    if (total === 0) return
    let alive = true
    ;(async () => {
      for (const i of [index, index + 1, index - 1, index + 2]) {
        if (i >= 0 && i < total) {
          await loadRatio(i)
          if (!alive) return
          setRatioTick((t) => t + 1)
        }
      }
    })()
    return () => { alive = false }
  }, [index, total, loadRatio])

  useEffect(() => {
    if (total === 0) return
    let alive = true
    ;(async () => {
      for (let i = 0; i < total; i++) {
        if (!alive) return
        await loadRatio(i)
      }
      if (alive) setRatioTick((t) => t + 1)
    })()
    return () => { alive = false }
  }, [total, loadRatio])

  // ---- Logique de pagination (identique au lecteur de bureau) ----
  const paginationState = { doublePage, total, pageOffset }

  const currentIndices = useCallback(() => (
    computeCurrentIndices(ratiosRef.current, paginationState, index)
  ), [ratioTick, doublePage, total, pageOffset, index])

  const goto = useCallback((i) => {
    setHudExtra('')
    setPan({ x: 0, y: 0 })
    setIndex(Math.max(0, Math.min(i, pagesRef.current.length - 1)))
  }, [])

  const nextPage = useCallback((step) => {
    const s = step ?? currentIndices().length
    if (index + s <= total - 1) goto(index + s)
    else if (index < total - 1) goto(total - 1)
    else setHudExtra('Fin du manga  (Echap : fermer)')
  }, [index, total, currentIndices, goto])

  const stepBack = useCallback(() => (
    computeStepBack(ratiosRef.current, { doublePage, index, total, pageOffset })
  ), [ratioTick, doublePage, index, total, pageOffset])

  const prevPage = useCallback((step) => {
    const s = step ?? stepBack()
    goto(Math.max(0, index - s))
  }, [index, stepBack, goto])

  // ---- Modes ----
  const toggleDouble = useCallback(() => setDoublePage((d) => !d), [])
  const toggleManga = useCallback(() => setMangaMode((m) => !m), [])
  // Decalage de parite (S) : on garde la page courante visible en la
  // re-appairant avec sa voisine precedente, plutot que de l'isoler en page
  // simple. (p, p+1) -> (p-1, p) ; c'est la bonne planche double quand une
  // couverture en tete decale tout l'appairage. Au tout debut, la couverture
  // reste seule (pas de voisine avant elle).
  const shiftParity = useCallback(() => {
    const no = pageOffset ^ 1
    setPageOffset(no)
    if (doublePage && index > 0 && ((index - no) % 2 !== 0)) {
      goto(index - 1)
    }
  }, [pageOffset, doublePage, index, goto])
  const cycleFit = useCallback(() => {
    setFitMode((f) => (f + 1) % 3)
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])
  const setZoomClamped = useCallback((v) => setZoom(Math.max(0.2, Math.min(6, v))), [])

  const toggleFullscreen = useCallback(() => {
    if (fsElement()) fsExit()
    else fsRequest(document.documentElement)
  }, [])

  useEffect(() => {
    const h = () => setIsFullscreen(!!fsElement())
    document.addEventListener('fullscreenchange', h)
    document.addEventListener('webkitfullscreenchange', h)
    return () => {
      document.removeEventListener('fullscreenchange', h)
      document.removeEventListener('webkitfullscreenchange', h)
    }
  }, [])

  // ---- Mesure de la zone d'affichage (pour l'ajustement) ----
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const update = () => setStageSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [total])

  // ---- Calcul de la disposition (1 ou 2 pages, ajustement, zoom) ----
  const indices = currentIndices()
  const displayReady = indices.every((i) => ratiosRef.current[i] != null)

  const layout = computeLayout({
    indices,
    ratios: ratiosRef.current,
    pages,
    mangaMode,
    fitMode,
    zoom,
    stageSize,
  })

  const clampPan = useCallback((x, y) => computeClampPan(layout, x, y), [layout])

  // ---- Clavier (mappage identique au lecteur de bureau) ----
  useEffect(() => {
    if (total === 0) return
    const onKey = (e) => {
      switch (e.key) {
        case 'ArrowDown':
        case ' ': e.preventDefault(); nextPage(); break
        case 'ArrowUp':
        case 'Backspace': e.preventDefault(); prevPage(); break
        case 'ArrowRight': e.preventDefault(); mangaMode ? prevPage() : nextPage(); break
        case 'ArrowLeft': e.preventDefault(); mangaMode ? nextPage() : prevPage(); break
        case 'PageDown': e.preventDefault(); nextPage(1); break
        case 'PageUp': e.preventDefault(); prevPage(1); break
        case 'Home': goto(0); break
        case 'End': goto(total - 1); break
        case 'd': case 'D': toggleDouble(); break
        case 'm': case 'M': toggleManga(); break
        case 's': case 'S': shiftParity(); break
        case 'f': case 'F': cycleFit(); break
        case '+': case '=': setZoomClamped(zoom * 1.15); break
        case '-': setZoomClamped(zoom / 1.15); break
        case '0': setZoomClamped(1); break
        case 'F11': e.preventDefault(); toggleFullscreen(); break
        case 'Escape':
          if (fsElement()) fsExit()
          else close()
          break
        default: break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [total, nextPage, prevPage, goto, mangaMode, zoom, toggleDouble, toggleManga,
      shiftParity, cycleFit, setZoomClamped, toggleFullscreen, close])

  // ---- Molette : Ctrl = zoom, sinon page suivante/precedente ----
  useEffect(() => {
    const el = stageRef.current
    if (!el || total === 0) return
    const onWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault()
        setZoomClamped(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))
        return
      }
      if (e.deltaY > 0) nextPage()
      else if (e.deltaY < 0) prevPage()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [total, zoom, nextPage, prevPage, setZoomClamped])

  // ---- Souris : glisser = pan, clic simple = zone gauche/droite ----
  const onPointerDown = (e) => {
    dragRef.current = { origin: { x: e.clientX, y: e.clientY }, dragged: false }
  }
  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d.origin || e.buttons !== 1) return
    const dx = e.clientX - d.origin.x
    const dy = e.clientY - d.origin.y
    if (d.dragged || Math.abs(dx) + Math.abs(dy) > 6) {
      d.dragged = true
      d.origin = { x: e.clientX, y: e.clientY }
      setPan((p) => clampPan(p.x + dx, p.y + dy))
    }
  }
  const onPointerUp = (e) => {
    const d = dragRef.current
    dragRef.current = { origin: null, dragged: false }
    if (d.dragged || !d.origin) return
    const rect = stageRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    if (x < rect.width * 0.4) mangaMode ? nextPage() : prevPage()
    else if (x > rect.width * 0.6) mangaMode ? prevPage() : nextPage()
  }

  // =================== ECRAN D'ACCUEIL ===================
  if (total === 0) {
    const onDrop = (e) => {
      e.preventDefault()
      const file = e.dataTransfer.files?.[0]
      if (file) openFile(file)
    }
    return (
      <div
        className="welcome"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <img className="logo" src="/icon-256.png" alt="Beheread" />
        <h1>Beheread <span className="badge">Web</span></h1>
        <p className="subtitle">
          Liseuse de mangas <code>.cbz</code> — tout se passe dans votre navigateur,
          aucun fichier n'est envoye sur Internet.
        </p>
        <input ref={inputRef} type="file" accept=".cbz,.zip" hidden onChange={(e) => openFile(e.target.files?.[0])} />
        <button className="primary" disabled={loading} onClick={() => inputRef.current?.click()}>
          {loading ? `Chargement... ${progress}%` : 'Ouvrir un fichier .cbz'}
        </button>
        {error && <p className="error">{error}</p>}
        <p className="hint">Ou glissez-deposez un fichier .cbz ici.</p>
      </div>
    )
  }

  // ---- Textes d'etat ----
  const pageLabel = indices.length === 2
    ? `Pages ${indices[0] + 1}-${indices[1] + 1} / ${total}`
    : `Page ${indices[0] + 1} / ${total}`

  // =================== LISEUSE ===================
  return (
    <div className={`reader${isFullscreen ? ' fullscreen' : ''}`}>
      <header className="toolbar">
        <button className="ghost" onClick={close} title="Fermer (Echap)">Fermer</button>
        <span className="title" title={fileName}>{fileName}</span>

        <div className="controls">
          <button onClick={toggleDouble} title="Simple / double page (D)">
            {doublePage ? 'Double' : 'Simple'} <kbd>D</kbd>
          </button>
          <button onClick={toggleManga} title="Sens de lecture (M)">
            {mangaMode ? 'Manga →←' : 'Normal ←→'} <kbd>M</kbd>
          </button>
          <button onClick={shiftParity} disabled={!doublePage}
                  title="Decalage de parite double page (S)">
            {pageOffset ? 'Decale' : 'Aligne'} <kbd>S</kbd>
          </button>
          <button onClick={cycleFit} title={`${FIT_NAMES[fitMode]} (F)`}>
            Ajuster <kbd>F</kbd>
          </button>
          <div className="zoom">
            <button onClick={() => setZoomClamped(zoom / 1.15)} title="Zoom - (-)">−</button>
            <button onClick={() => setZoomClamped(1)} title="Reinitialiser (0)">{Math.round(zoom * 100)}%</button>
            <button onClick={() => setZoomClamped(zoom * 1.15)} title="Zoom + (+)">+</button>
          </div>
          {fsSupported() && (
            <button onClick={toggleFullscreen} title="Plein ecran (F11)">
              {isFullscreen ? 'Quitter' : 'Plein ecran'}
            </button>
          )}
        </div>
      </header>

      <div
        className="stage"
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ cursor: layout && (layout.overflowX || layout.overflowY) ? 'grab' : 'default' }}
      >
        {!displayReady && <div className="loading">Chargement...</div>}
        {layout && (
          <div
            className="page-fade"
            key={`${index}-${mangaMode}-${doublePage}`}
            style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}
          >
            {layout.sized.map((it) => (
              <img
                key={it.i}
                src={it.src}
                width={Math.round(it.w)}
                height={Math.round(it.h)}
                className="page-img"
                alt={`Page ${it.i + 1}`}
                draggable={false}
              />
            ))}
          </div>
        )}
      </div>

      <footer className="statusbar">
        <span className="hud">
          {pageLabel}
          <span className="sep">|</span>{doublePage ? 'Double' : 'Page unique'}
          {doublePage && <><span className="sep">|</span>{pageOffset ? 'Decalage [S]' : 'Aligne [S]'}</>}
          <span className="sep">|</span>{mangaMode ? 'Manga (droite → gauche)' : 'Normal (gauche → droite)'}
          <span className="sep">|</span>{FIT_NAMES[fitMode]}
          {zoom !== 1 && <><span className="sep">|</span>Zoom {Math.round(zoom * 100)}%</>}
          {hudExtra && <><span className="sep">|</span><strong>{hudExtra}</strong></>}
        </span>
        <input
          className="slider"
          type="range"
          min={0}
          max={Math.max(0, total - 1)}
          value={index}
          onChange={(e) => goto(Number(e.target.value))}
        />
      </footer>
    </div>
  )
}
