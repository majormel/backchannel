export const SETUP_COMPLETE_KEY = 'backchannel_setup_complete_v1'

export type ConnectionSource = 'iphone' | 'local' | 'lan'

export type IphoneProfileInstallStep = {
  title: string
  detail: string
}

export const IPHONE_PROFILE_INSTALL_STEPS: IphoneProfileInstallStep[] = [
  {
    title: 'Save and open the profile',
    detail: 'If Safari shows backchannel.mobileconfig, tap Save..., then open it from Files > Downloads. If iOS shows Profile Downloaded instead, continue in Settings.',
  },
  {
    title: 'Install it in Settings',
    detail: 'Open Settings, tap Profile Downloaded, then tap Install. If that row is missing, open General > VPN & Device Management.',
  },
  {
    title: 'Trust the certificate',
    detail: 'Open Settings > General > About > Certificate Trust Settings and enable full trust for mitmproxy.',
  },
  {
    title: 'Confirm the connection',
    detail: 'Open a website or app while capture is running. Backchannel will confirm when traffic arrives.',
  },
]

export type LaunchpadState = {
  initialLoadComplete: boolean
  setupComplete: boolean
  proxyRunning: boolean
  totalFlows: number
}

export function loadSetupComplete(storage: Storage = window.localStorage): boolean {
  try {
    return storage.getItem(SETUP_COMPLETE_KEY) === 'true'
  } catch {
    return false
  }
}

export function saveSetupComplete(complete: boolean, storage: Storage = window.localStorage): void {
  try {
    if (complete) {
      storage.setItem(SETUP_COMPLETE_KEY, 'true')
    } else {
      storage.removeItem(SETUP_COMPLETE_KEY)
    }
  } catch {
    return
  }
}

export function shouldShowLaunchpad(state: LaunchpadState): boolean {
  return state.initialLoadComplete && !state.setupComplete && !state.proxyRunning && state.totalFlows === 0
}

export function listenHostForSource(source: ConnectionSource): string {
  return source === 'local' ? '127.0.0.1' : '0.0.0.0'
}

export function proxyTargetForSource(source: ConnectionSource, lanIp: string, port: number): string {
  const host = source === 'local' ? '127.0.0.1' : lanIp
  return host ? `${host}:${port}` : ''
}
