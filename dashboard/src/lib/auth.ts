export const TOKEN_KEY = 'backchannel_dashboard_token_v1'

const LEGACY_TOKEN_KEY = 'mcp_token'

function getStoredToken(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function setStoredToken(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value)
  } catch {
    return
  }
}

function removeStoredToken(storage: Storage, key: string): void {
  try {
    storage.removeItem(key)
  } catch {
    return
  }
}

export function readTokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('token')
}

export function stripTokenFromUrl(): void {
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('token')) return
    url.searchParams.delete('token')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  } catch {
    return
  }
}

export function loadToken(): string | null {
  const urlToken = readTokenFromUrl()?.trim()
  if (urlToken) {
    saveToken(urlToken)
    stripTokenFromUrl()
    removeStoredToken(window.localStorage, LEGACY_TOKEN_KEY)
    return urlToken
  }

  const sessionToken = getStoredToken(window.sessionStorage, TOKEN_KEY)
  if (sessionToken) return sessionToken

  const legacyToken = getStoredToken(window.localStorage, LEGACY_TOKEN_KEY)?.trim()
  if (legacyToken) {
    setStoredToken(window.sessionStorage, TOKEN_KEY, legacyToken)
    removeStoredToken(window.localStorage, LEGACY_TOKEN_KEY)
    return legacyToken
  }
  return null
}

export function saveToken(token: string): void {
  const trimmed = token.trim()
  if (trimmed) {
    setStoredToken(window.sessionStorage, TOKEN_KEY, trimmed)
    return
  }
  removeStoredToken(window.sessionStorage, TOKEN_KEY)
}

export function clearToken(): void {
  removeStoredToken(window.sessionStorage, TOKEN_KEY)
  removeStoredToken(window.localStorage, LEGACY_TOKEN_KEY)
}
