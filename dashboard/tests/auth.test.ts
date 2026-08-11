import { afterEach, describe, expect, it } from 'vitest'

import { TOKEN_KEY, clearToken, loadToken, saveToken } from '../src/lib/auth'

afterEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  window.history.replaceState({}, '', '/')
})

describe('dashboard token handling', () => {
  it('moves a URL token into session storage and removes it from the address bar', () => {
    window.history.replaceState({}, '', '/?token=temporary-secret&view=capture')

    expect(loadToken()).toBe('temporary-secret')
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe('temporary-secret')
    expect(window.location.search).toBe('?view=capture')
    expect(localStorage.getItem('mcp_token')).toBeNull()
  })

  it('migrates a legacy persistent token into the current session', () => {
    localStorage.setItem('mcp_token', 'legacy-secret')

    expect(loadToken()).toBe('legacy-secret')
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe('legacy-secret')
    expect(localStorage.getItem('mcp_token')).toBeNull()
  })

  it('saves and clears only session-scoped credentials', () => {
    saveToken('  session-secret  ')
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe('session-secret')

    clearToken()
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem('mcp_token')).toBeNull()
  })
})
