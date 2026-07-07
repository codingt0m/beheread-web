import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadPrefs, savePrefs } from './prefs.js'

describe('loadPrefs / savePrefs', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renvoie un objet vide si rien n\'est stocke', () => {
    expect(loadPrefs()).toEqual({})
  })

  it('recharge exactement ce qui a ete sauvegarde', () => {
    savePrefs({ doublePage: false, mangaMode: true, fitMode: 2, pageOffset: 1 })
    expect(loadPrefs()).toEqual({ doublePage: false, mangaMode: true, fitMode: 2, pageOffset: 1 })
  })

  it('renvoie un objet vide si le contenu stocke est corrompu', () => {
    localStorage.setItem('beheread-web:prefs', '{not-json')
    expect(loadPrefs()).toEqual({})
  })

  it('n\'explose pas si localStorage.setItem leve (ex: Safari navigation privee)', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => savePrefs({ doublePage: true })).not.toThrow()
    spy.mockRestore()
  })
})
