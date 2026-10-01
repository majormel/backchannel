import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConnectionDialog } from '../src/components/ConnectionExperience'
import { getNetworkInfo } from '../src/lib/api'
import type { NetworkInfo } from '../src/lib/types'

vi.mock('../src/lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/lib/api')>(),
  getNetworkInfo: vi.fn(),
}))

const network: NetworkInfo = {
  lan_ip: '10.0.0.2', proxy_port: 8080, dashboard_port: 8800,
  cert_available: true, wifi_ssid: 'Studio WiFi',
}
const props = {
  open: true, initialSource: 'iphone' as const, token: 'test-token',
  status: { running: false, capture_path: '' }, connectedClients: [],
  lastActivity: null, onOpenChange: vi.fn(), onPrepareConnection: vi.fn(),
  onComplete: vi.fn(), onCopyToClipboard: vi.fn(),
}

let root: Root
let container: HTMLDivElement
const input = () => document.querySelector<HTMLInputElement>('#connection-wifi-ssid')!

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(),
  })))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

async function typeName(name: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), name)
    input().dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('iPhone Wi-Fi autofill', () => {
  it('fills the laptop network and lets the user change it', async () => {
    vi.mocked(getNetworkInfo).mockResolvedValue(network)
    await act(async () => root.render(createElement(ConnectionDialog, props)))
    expect(input().value).toBe('Studio WiFi')
    expect(document.body.textContent).toContain('Detected on laptop')
    await typeName('Other WiFi')
    expect(input().value).toBe('Other WiFi')
    expect(document.body.textContent).not.toContain('Detected on laptop')
  })

  it('never overwrites a name typed while detection is pending, even if cleared', async () => {
    let resolve!: (value: NetworkInfo) => void
    vi.mocked(getNetworkInfo).mockReturnValue(new Promise((done) => { resolve = done }))
    await act(async () => root.render(createElement(ConnectionDialog, props)))
    expect(document.body.textContent).toContain('Detecting laptop Wi-Fi')
    await typeName('My phone network')
    await typeName('')
    await act(async () => resolve(network))
    expect(input().value).toBe('')
  })

  it('keeps manual entry available when detection is unavailable', async () => {
    vi.mocked(getNetworkInfo).mockResolvedValue({ ...network, wifi_ssid: null })
    await act(async () => root.render(createElement(ConnectionDialog, props)))
    expect(input().value).toBe('')
    expect(document.body.textContent).toContain('Automatic detection is unavailable')
    await typeName('Home WiFi')
    expect(input().value).toBe('Home WiFi')
  })

  it('preserves edits after closing and reopening the dialog', async () => {
    vi.mocked(getNetworkInfo).mockResolvedValue(network)
    await act(async () => root.render(createElement(ConnectionDialog, props)))
    await typeName('Phone WiFi')
    await act(async () => root.render(createElement(ConnectionDialog, { ...props, open: false })))
    vi.mocked(getNetworkInfo).mockResolvedValue({ ...network, wifi_ssid: 'New laptop WiFi' })
    await act(async () => root.render(createElement(ConnectionDialog, props)))
    expect(input().value).toBe('Phone WiFi')
  })

  it('aborts detection when the dialog closes', async () => {
    vi.mocked(getNetworkInfo).mockReturnValue(new Promise(() => {}))
    await act(async () => root.render(createElement(ConnectionDialog, props)))
    const signal = vi.mocked(getNetworkInfo).mock.calls[0][1]!
    await act(async () => root.render(createElement(ConnectionDialog, { ...props, open: false })))
    expect(signal.aborted).toBe(true)
  })
})
