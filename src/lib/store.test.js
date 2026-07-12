import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as drive from './drive.js'
import * as idb from './indexedDbCache.js'
import { Store, keyForDriveFile } from './store.js'

describe('Store', () => {
  beforeEach(() => {
    vi.spyOn(idb, 'idbGet').mockResolvedValue(null)
    vi.spyOn(idb, 'idbSet').mockResolvedValue(undefined)
    vi.spyOn(drive, 'readAppDataJSON').mockImplementation(async (_token, _name, def) => def)
    vi.spyOn(drive, 'writeAppDataJSON').mockResolvedValue({})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('keys a Drive file by md5Checksum, falling back to file id', () => {
    expect(keyForDriveFile({ id: '1', md5Checksum: 'abc' })).toBe('md5:abc')
    expect(keyForDriveFile({ id: '1' })).toBe('id:1')
  })

  it('returns null progress for an unknown key', async () => {
    const store = new Store(() => 'token')
    await store.init()
    expect(store.getProgress('md5:x')).toBeNull()
  })

  it('debounces rapid progress writes into a single flush', async () => {
    vi.useFakeTimers()
    const store = new Store(() => 'token')
    await store.init()

    store.setProgress('md5:x', 3, 10, false)
    store.setProgress('md5:x', 4, 10, false)
    store.setProgress('md5:x', 5, 10, false)

    expect(drive.writeAppDataJSON).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(600)

    expect(drive.writeAppDataJSON).toHaveBeenCalledTimes(1)
    expect(store.getProgress('md5:x')).toEqual({ page: 5, total: 10, finished: false })
  })

  it('flushes immediately for a library folder change', async () => {
    const store = new Store(() => 'token')
    await store.init()
    await store.setLibraryFolder({ id: 'f1', name: 'Manga' })
    expect(drive.writeAppDataJSON).toHaveBeenCalledWith('token', 'settings.json', expect.objectContaining({
      libraryFolder: { id: 'f1', name: 'Manga' },
    }))
  })

  it('resolves reading direction: series override beats volume, both beat null', async () => {
    const store = new Store(() => 'token')
    await store.init()
    expect(store.readingDirection('md5:x', 'berserk')).toBeNull()

    await store.setReadingDirection('md5:x', null, true)
    expect(store.readingDirection('md5:x', null)).toBe(true)

    await store.setReadingDirection('md5:x', 'berserk', false)
    expect(store.readingDirection('md5:x', 'berserk')).toBe(false)
  })

  it('does not write to Drive when signed out (no token)', async () => {
    vi.useFakeTimers()
    const store = new Store(() => null)
    await store.init()
    store.setProgress('md5:x', 1, 5, false)
    await vi.advanceTimersByTimeAsync(600)
    expect(drive.writeAppDataJSON).not.toHaveBeenCalled()
    expect(idb.idbSet).toHaveBeenCalled() // still cached locally
  })
})
