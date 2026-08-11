import { afterEach, describe, expect, it, vi } from 'vitest'

import { getReconnectDelayMs } from '../src/hooks/useWebSocket'

afterEach(() => {
  vi.useRealTimers()
})

describe('getReconnectDelayMs', () => {
  it('uses exponential backoff before the fallback window is exhausted', () => {
    expect(getReconnectDelayMs(1, 0, 0)).toBe(1000)
    expect(getReconnectDelayMs(2, 0, 1000)).toBe(2000)
    expect(getReconnectDelayMs(3, 0, 3000)).toBe(4000)
    expect(getReconnectDelayMs(4, 0, 7000)).toBe(8000)
    expect(getReconnectDelayMs(5, 0, 15000)).toBe(15000)
  })

  it('falls back only after 30 seconds of continuous failure', () => {
    expect(getReconnectDelayMs(1, 10_000, 39_000)).toBe(1000)
    expect(getReconnectDelayMs(2, 10_000, 39_500)).toBe(500)
    expect(getReconnectDelayMs(3, 10_000, 40_000)).toBeNull()
  })

  it('restarts the failure window after a fallback retry pause', () => {
    vi.useFakeTimers()
    const resumedAt = 45_000
    expect(getReconnectDelayMs(1, resumedAt, resumedAt)).toBe(1000)
    expect(getReconnectDelayMs(2, resumedAt, resumedAt + 1000)).toBe(2000)
  })
})
