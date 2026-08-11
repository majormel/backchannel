import { afterEach, describe, expect, it } from 'vitest'

import {
  IPHONE_PROFILE_INSTALL_STEPS,
  SETUP_COMPLETE_KEY,
  listenHostForSource,
  loadSetupComplete,
  proxyTargetForSource,
  saveSetupComplete,
  shouldShowLaunchpad,
} from '../src/lib/setup'

afterEach(() => {
  localStorage.clear()
})

describe('setup persistence', () => {
  it('stores and clears the versioned completion flag', () => {
    expect(loadSetupComplete()).toBe(false)
    saveSetupComplete(true)
    expect(localStorage.getItem(SETUP_COMPLETE_KEY)).toBe('true')
    expect(loadSetupComplete()).toBe(true)
    saveSetupComplete(false)
    expect(loadSetupComplete()).toBe(false)
  })

  it('ignores malformed completion values', () => {
    localStorage.setItem(SETUP_COMPLETE_KEY, 'yes')
    expect(loadSetupComplete()).toBe(false)
  })

  it('fails closed when browser storage is unavailable', () => {
    const unavailableStorage = {
      getItem: () => { throw new Error('unavailable') },
      setItem: () => { throw new Error('unavailable') },
      removeItem: () => { throw new Error('unavailable') },
    } as unknown as Storage
    expect(loadSetupComplete(unavailableStorage)).toBe(false)
    expect(() => saveSetupComplete(true, unavailableStorage)).not.toThrow()
  })

  it('does not reopen after skip when traffic is later cleared', () => {
    saveSetupComplete(true)
    expect(shouldShowLaunchpad({ initialLoadComplete: true, setupComplete: loadSetupComplete(), proxyRunning: false, totalFlows: 0 })).toBe(false)
  })
})

describe('launchpad visibility', () => {
  it('waits for initial data before showing', () => {
    expect(shouldShowLaunchpad({ initialLoadComplete: false, setupComplete: false, proxyRunning: false, totalFlows: 0 })).toBe(false)
  })

  it('shows only for an incomplete offline empty workspace', () => {
    expect(shouldShowLaunchpad({ initialLoadComplete: true, setupComplete: false, proxyRunning: false, totalFlows: 0 })).toBe(true)
    expect(shouldShowLaunchpad({ initialLoadComplete: true, setupComplete: true, proxyRunning: false, totalFlows: 0 })).toBe(false)
    expect(shouldShowLaunchpad({ initialLoadComplete: true, setupComplete: false, proxyRunning: true, totalFlows: 0 })).toBe(false)
    expect(shouldShowLaunchpad({ initialLoadComplete: true, setupComplete: false, proxyRunning: false, totalFlows: 1 })).toBe(false)
  })
})

describe('connection targets', () => {
  it('binds local and LAN sources to the expected interfaces', () => {
    expect(listenHostForSource('local')).toBe('127.0.0.1')
    expect(listenHostForSource('iphone')).toBe('0.0.0.0')
    expect(listenHostForSource('lan')).toBe('0.0.0.0')
  })

  it('builds loopback and LAN proxy targets', () => {
    expect(proxyTargetForSource('local', '10.0.0.8', 8080)).toBe('127.0.0.1:8080')
    expect(proxyTargetForSource('lan', '10.0.0.8', 8080)).toBe('10.0.0.8:8080')
    expect(proxyTargetForSource('iphone', '', 8080)).toBe('')
  })
})

describe('iPhone profile guidance', () => {
  it('covers the complete manual installation path after scanning', () => {
    expect(IPHONE_PROFILE_INSTALL_STEPS.map((step) => step.title)).toEqual([
      'Save and open the profile',
      'Install it in Settings',
      'Trust the certificate',
      'Confirm the connection',
    ])
    expect(IPHONE_PROFILE_INSTALL_STEPS[0].detail).toContain('Files > Downloads')
    expect(IPHONE_PROFILE_INSTALL_STEPS[1].detail).toContain('VPN & Device Management')
    expect(IPHONE_PROFILE_INSTALL_STEPS[2].detail).toContain('Certificate Trust Settings')
  })
})
