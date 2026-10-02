import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Globe2,
  Laptop2,
  Loader2,
  MonitorSmartphone,
  Network,
  Play,
  QrCode,
  Router,
  ShieldCheck,
  Smartphone,
  Wifi,
} from '@/components/ui/icons'

import { createMobilePairing, getMobilePairing, getNetworkInfo } from '@/lib/api'
import { IPHONE_PROFILE_INSTALL_STEPS, proxyTargetForSource, type ConnectionSource } from '@/lib/setup'
import type { MitmStatus, MobilePairing } from '@/lib/types'
import { ConnectionMark } from './layout/ConnectionMark'
import { SignalLens } from './layout/SignalLens'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { SpotlightCard } from './ui/spotlight-card'

type SourceDefinition = {
  source: ConnectionSource
  title: string
  eyebrow: string
  detail: string
  summary: string
  icon: typeof Smartphone
  recommended?: boolean
}

const SOURCE_DEFINITIONS: SourceDefinition[] = [
  {
    source: 'iphone',
    title: 'Pair an iPhone',
    eyebrow: 'One-scan setup',
    detail: 'Create a short-lived Wi-Fi profile with the proxy and certificate bundled together.',
    summary: 'Capture app traffic with a guided QR setup.',
    icon: Smartphone,
    recommended: true,
  },
  {
    source: 'local',
    title: 'This Mac or browser',
    eyebrow: 'Loopback capture',
    detail: 'Start a local proxy for a browser, desktop app, simulator, or command-line client.',
    summary: 'Inspect a browser, desktop app, or local server.',
    icon: Laptop2,
  },
  {
    source: 'lan',
    title: 'Another device',
    eyebrow: 'Manual LAN setup',
    detail: 'Expose the proxy on your network and connect any device that supports a manual HTTP proxy.',
    summary: 'Connect Android and other devices on your network.',
    icon: Network,
  },
]

type SourceCardsProps = {
  onChoose: (source: ConnectionSource) => void
  compact?: boolean
}

function SourceCards({ onChoose, compact = false }: SourceCardsProps) {
  const reducedMotion = useReducedMotion()
  if (compact) {
    return (
      <div className="space-y-3">
        {SOURCE_DEFINITIONS.map((definition, index) => {
          const Icon = definition.icon
          return (
            <motion.button
              key={definition.source}
              type="button"
              className="connection-option group"
              data-recommended={definition.recommended || undefined}
              onClick={() => onChoose(definition.source)}
              initial={reducedMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.055 }}
            >
              <span className="connection-option-icon"><Icon className="h-5 w-5" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-[15px] font-semibold tracking-[-0.025em] text-foreground sm:text-base">{definition.title}</span>
                  {definition.recommended ? <span className="connection-recommended">Quick setup</span> : null}
                </span>
                <span className="block text-xs leading-5 text-muted-foreground sm:text-[13px]">{definition.summary}</span>
              </span>
              <ArrowRight className="connection-option-arrow h-4 w-4 shrink-0" aria-hidden="true" />
            </motion.button>
          )
        })}
      </div>
    )
  }
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {SOURCE_DEFINITIONS.map((definition, index) => {
        const Icon = definition.icon
        return (
          <motion.div
            key={definition.source}
            initial={reducedMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38, delay: 0.08 + index * 0.06, ease: [0.22, 1, 0.36, 1] }}
          >
            <SpotlightCard
              className={`source-card h-full w-full p-5 ${definition.recommended ? 'border-accent/25 bg-accent/[0.045] hover:border-accent/40 hover:bg-accent/[0.06]' : ''}`}
              onClick={() => onChoose(definition.source)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <span className="font-mono text-[10px] text-muted-foreground/60">0{index + 1}<span className="ml-1 text-accent/50">/</span></span>
              </div>
              <div className="terminal-label mt-6 text-[9px] text-accent/65">{definition.eyebrow}</div>
              <div className="mt-2 flex items-center gap-2 text-base font-semibold text-foreground">
                {definition.title}
                <ArrowRight className="h-4 w-4 translate-x-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-accent" />
              </div>
              <p className="mt-2 text-xs leading-[1.8] text-muted-foreground">{definition.detail}</p>
            </SpotlightCard>
          </motion.div>
        )
      })}
    </div>
  )
}

type ConnectionLaunchpadProps = {
  onChoose: (source: ConnectionSource) => void
  onSkip: () => void
}

export function ConnectionLaunchpad({ onChoose, onSkip }: ConnectionLaunchpadProps) {
  const reducedMotion = useReducedMotion()
  return (
    <div className="connection-launchpad relative flex min-h-0 flex-1 overflow-auto px-5 py-6 sm:px-8 lg:px-12">
      <div className="relative z-10 m-auto flex w-full max-w-[1120px] flex-col py-6">
        <motion.div className="launchpad-hero grid items-center gap-6 lg:grid-cols-[1fr_340px]" initial={reducedMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.44, ease: [0.22, 1, 0.36, 1] }}>
          <div className="relative z-10 max-w-3xl">
            <div className="terminal-label flex items-center gap-2 text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_12px_hsl(var(--accent)/0.4)]" />
              Your channel is ready
            </div>
            <h1 className="mt-6 text-4xl font-medium leading-[1.06] tracking-[-0.055em] text-foreground sm:text-5xl xl:text-[64px]">
              Behind every app,<br /><span className="text-accent">there’s a signal.</span>
            </h1>
            <p className="mt-6 max-w-md text-sm leading-7 text-muted-foreground">
              Open a channel to it. Capture requests, uncover patterns, and understand what your apps are really saying.
            </p>
            <div className="mt-6 flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground"><span className="rounded border border-white/10 bg-white/[0.025] px-2 py-1">HTTP / HTTPS / WS</span><span>Local. Inspectable. Yours.</span></div>
          </div>
          <div className="relative hidden lg:block"><SignalLens className="h-[340px] w-[340px]" /><span className="terminal-label absolute bottom-0 right-4 text-[8px] text-accent/50">[ Packet lens ]</span></div>
        </motion.div>

        <div className="mt-10 lg:mt-12">
          <div className="terminal-label mb-4 flex items-center gap-3 text-[9px] text-muted-foreground"><span className="text-accent/60">01</span>Choose your traffic source<span className="h-px flex-1 bg-white/[0.07]" /></div>
          <SourceCards onChoose={onChoose} />
        </div>

        <motion.div
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.34, duration: 0.3 }}
          className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-hairline pt-5"
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" />
            Your capture stays on this machine.
          </div>
          <Button variant="ghost" size="sm" onClick={onSkip}>Open an empty workspace<ArrowRight className="ml-2 h-3.5 w-3.5" /></Button>
        </motion.div>
      </div>
    </div>
  )
}

type ConnectionDialogProps = {
  open: boolean
  initialSource: ConnectionSource | null
  token: string | null
  status: MitmStatus
  connectedClients: string[]
  lastActivity: number | null
  onOpenChange: (open: boolean) => void
  onPrepareConnection: (source: ConnectionSource) => Promise<MitmStatus>
  onComplete: () => void
  onCopyToClipboard: (value: string) => void
}

export function ConnectionDialog({
  open,
  initialSource,
  token,
  status,
  connectedClients,
  lastActivity,
  onOpenChange,
  onPrepareConnection,
  onComplete,
  onCopyToClipboard,
}: ConnectionDialogProps) {
  const reducedMotion = useReducedMotion()
  const [source, setSource] = useState<ConnectionSource | null>(initialSource)
  const [wifiSsid, setWifiSsid] = useState('')
  const wifiEdited = useRef(false)
  const [detectedWifi, setDetectedWifi] = useState<string | null>(null)
  const [detectingWifi, setDetectingWifi] = useState(false)
  const [preparedStatus, setPreparedStatus] = useState<MitmStatus | null>(null)
  const [pairing, setPairing] = useState<MobilePairing | null>(null)
  const [preparedAt, setPreparedAt] = useState<number | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState('')

  useLayoutEffect(() => {
    if (!open) return
    setSource(initialSource)
    setPreparedStatus(null)
    setPairing(null)
    setPreparedAt(null)
    setError('')
  }, [initialSource, open])

  useEffect(() => {
    if (!open || source !== 'iphone' || !token) {
      setDetectingWifi(false)
      return
    }
    const controller = new AbortController()
    setDetectingWifi(true)
    setDetectedWifi(null)
    void getNetworkInfo(token, controller.signal)
      .then((network) => {
        if (controller.signal.aborted) return
        const ssid = network.wifi_ssid || null
        setDetectedWifi(ssid)
        if (!wifiEdited.current) setWifiSsid(ssid || '')
      })
      .catch(() => {
        if (!controller.signal.aborted && !wifiEdited.current) setWifiSsid('')
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetectingWifi(false)
      })
    return () => controller.abort()
  }, [open, source, token])

  useEffect(() => {
    if (!pairing?.token || pairing.status === 'expired') return
    const refreshPairing = async () => {
      try {
        const next = await getMobilePairing(pairing.token, token)
        setPairing((current) => current ? { ...current, ...next, qr_image_data_url: current.qr_image_data_url } : current)
      } catch {
        return
      }
    }
    const interval = window.setInterval(() => void refreshPairing(), 2000)
    return () => window.clearInterval(interval)
  }, [pairing?.status, pairing?.token, token])

  const effectiveStatus = preparedStatus || status
  const port = effectiveStatus.listen_port || 8080
  const lanIp = effectiveStatus.lan_ip || ''
  const target = source ? proxyTargetForSource(source, lanIp, port) : ''
  const trafficDetected = source === 'iphone'
    ? Boolean(pairing?.client_ip && connectedClients.includes(pairing.client_ip))
    : Boolean(preparedAt && lastActivity && lastActivity * 1000 >= preparedAt - 1000)
  const profileSent = pairing?.status === 'downloaded'
  const minutesRemaining = pairing ? Math.max(0, Math.ceil(pairing.expires_in_seconds / 60)) : 0

  useEffect(() => {
    if (trafficDetected) onComplete()
  }, [onComplete, trafficDetected])

  const selectedDefinition = useMemo(() => SOURCE_DEFINITIONS.find((item) => item.source === source) || null, [source])

  const handlePrepare = async () => {
    if (!source) return
    if (source === 'iphone' && !wifiSsid.trim()) {
      setError('Enter the exact Wi-Fi network name used by the iPhone.')
      return
    }
    setPreparing(true)
    setError('')
    const attemptStartedAt = Date.now()
    try {
      const nextStatus = await onPrepareConnection(source)
      setPreparedStatus(nextStatus)
      setPreparedAt(attemptStartedAt)
      if (source === 'iphone') {
        const nextPairing = await createMobilePairing(wifiSsid, token)
        setPairing(nextPairing)
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not prepare this connection.')
    } finally {
      setPreparing(false)
    }
  }

  const handleOpenWorkspace = () => {
    onComplete()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="connection-drawer left-auto right-0 top-0 flex h-[100dvh] w-full max-w-2xl translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-y-0 border-r-0 bg-background/84 p-0 sm:rounded-none">
        <DialogHeader className="connection-header shrink-0 space-y-0 text-left">
          <div className="mb-6 flex h-7 items-center pr-10">
            {source ? (
              <button
                type="button"
                onClick={() => {
                  setSource(null)
                  setPreparedStatus(null)
                  setPairing(null)
                  setPreparedAt(null)
                  setError('')
                }}
                className="connection-back inline-flex items-center gap-2 rounded-md text-xs text-muted-foreground transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
                aria-label="Back to connection sources"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                All sources
              </button>
            ) : (
              <div className="terminal-label flex items-center gap-2.5 text-[9px] text-muted-foreground">
                <span className="text-accent/80">Backchannel</span>
                <span className="text-white/20">/</span>
                Connect
              </div>
            )}
          </div>
          <div className="flex items-start gap-4 sm:gap-5">
            <ConnectionMark />
            <div className="min-w-0 flex-1 pt-0.5">
              <DialogTitle className="text-[26px] font-medium leading-[1.15] tracking-[-0.045em] sm:text-[30px]">
                {selectedDefinition?.title || 'Open a channel'}
                {!source ? <span className="ml-1.5 text-accent" aria-hidden="true">_</span> : null}
              </DialogTitle>
              <DialogDescription className="mt-2 max-w-md text-[13px] leading-[1.65]">
                {selectedDefinition?.summary || 'Choose a device. See what it’s sending.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-6 sm:px-8 sm:py-7">
          <AnimatePresence mode="wait" initial={false}>
            {!source ? (
              <motion.div key="sources" initial={reducedMotion ? false : { opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -12 }} transition={{ duration: reducedMotion ? 0 : 0.2 }}>
                <div className="terminal-label mb-4 flex items-center justify-between text-[9px] text-muted-foreground">
                  <span>Select your source</span><span className="text-muted-foreground/50">01 — 03</span>
                </div>
                <SourceCards onChoose={setSource} compact />
                <div className="mt-6 flex items-start gap-2.5 px-1 text-xs leading-5 text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent/70" aria-hidden="true" />
                  <div><p className="text-foreground/75">Captured traffic stays on your computer.</p><p className="mt-1 text-[11px] text-muted-foreground/80">Connecting a network device may restart the proxy. Your captures are preserved.</p></div>
                </div>
              </motion.div>
            ) : (
              <motion.div key={source} initial={reducedMotion ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 16 }} transition={{ duration: reducedMotion ? 0 : 0.2 }} className="space-y-5">
                {source === 'iphone' ? (
                  <div className="glass-panel space-y-5 p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">Secure pairing</div>
                        <h3 className="mt-2 text-lg font-semibold text-foreground">Connect on the same Wi-Fi</h3>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">This profile tells your iPhone to use Backchannel on this Wi-Fi and includes the mitmproxy certificate.</p>
                      </div>
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-hairline bg-white/[0.04]">
                        <MonitorSmartphone className="h-5 w-5 text-accent" />
                      </div>
                    </div>

                    {!pairing ? (
                      <>
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Label htmlFor="connection-wifi-ssid">Wi-Fi network your iPhone uses</Label>
                            <span className="flex items-center gap-1.5 font-mono text-[10px] text-accent" role="status">
                              {detectingWifi ? <><Loader2 className="h-3 w-3 animate-spin" />Detecting laptop Wi-Fi…</> : detectedWifi && wifiSsid === detectedWifi ? <><Wifi className="h-3 w-3" />Detected on laptop</> : null}
                            </span>
                          </div>
                          <Input id="connection-wifi-ssid" value={wifiSsid} onChange={(event) => { wifiEdited.current = true; setWifiSsid(event.target.value) }} placeholder="Exact Wi-Fi network name" maxLength={32} autoComplete="off" aria-describedby="connection-wifi-help" />
                          <p id="connection-wifi-help" className="text-xs leading-5 text-muted-foreground">
                            {detectedWifi && wifiSsid === detectedWifi
                              ? 'Filled from your laptop. Check that your iPhone uses this same network in Settings > Wi-Fi. You can edit the name if needed.'
                              : detectingWifi
                                ? 'Keep your laptop and iPhone on the same Wi-Fi. You can also enter the name yourself.'
                                : 'Enter the name beside the checkmark in iPhone Settings > Wi-Fi, including spaces and capitalization. Use the network name, not its password.'}
                          </p>
                          {!detectingWifi && !detectedWifi && token ? <p className="text-xs text-muted-foreground">Automatic detection is unavailable. Your laptop may use Ethernet, or the system may hide its Wi-Fi name.</p> : null}
                        </div>
                        <Button className="w-full" onClick={() => void handlePrepare()} disabled={preparing || !token}>
                          {preparing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
                          {preparing ? 'Preparing LAN capture…' : 'Start capture and create QR code'}
                        </Button>
                      </>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid gap-5 sm:grid-cols-[180px_minmax(0,1fr)]">
                          <div className="rounded-xl bg-white p-3 shadow-[0_18px_44px_rgba(0,0,0,0.35)]">
                            {pairing.qr_image_data_url ? <img src={pairing.qr_image_data_url} alt="iPhone pairing QR code" width="320" height="320" className="aspect-square w-full" /> : null}
                          </div>
                          <div className="space-y-4">
                            <div>
                              <div className="text-sm font-semibold text-foreground">Scan, then finish setup on the iPhone</div>
                              <div className="mt-1 text-xs leading-5 text-muted-foreground">Use the Camera app. The QR code expires in about {minutesRemaining} minute{minutesRemaining === 1 ? '' : 's'}.</div>
                            </div>
                            <div className={`rounded-xl border px-4 py-3 ${
                              trafficDetected
                                ? 'border-accent/25 bg-accent/10'
                                : profileSent
                                  ? 'border-aqua/20 bg-aqua/[0.06]'
                                  : 'border-hairline bg-black/15'
                            }`} aria-live="polite">
                              <div className="flex items-start gap-3">
                                <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${trafficDetected ? 'bg-accent/15 text-accent' : profileSent ? 'bg-aqua/10 text-aqua' : 'bg-white/[0.05] text-muted-foreground'}`}>
                                  {trafficDetected ? <Check className="h-4 w-4" /> : profileSent ? <ShieldCheck className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-foreground">
                                    {trafficDetected ? 'Connection verified' : profileSent ? 'Profile sent to the iPhone' : 'Waiting for the iPhone'}
                                  </div>
                                  <div className="mt-0.5 text-xs leading-5 text-muted-foreground">
                                    {trafficDetected
                                      ? 'Backchannel detected traffic from this phone.'
                                      : profileSent
                                        ? 'Complete the installation and trust steps below. A download does not mean the profile is installed yet.'
                                        : 'Scan the QR code to request the profile from this Mac.'}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="overflow-hidden rounded-xl border border-hairline bg-black/15">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-3">
                            <div>
                              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Finish on your iPhone</div>
                              <div className="mt-1 text-xs text-muted-foreground">iOS never installs or trusts this profile automatically.</div>
                            </div>
                            <span className="rounded-pill border border-warning/20 bg-warning/10 px-2.5 py-1 text-[10px] font-medium text-warning">Install within 8 minutes</span>
                          </div>
                          <ol className="divide-y divide-hairline">
                            {IPHONE_PROFILE_INSTALL_STEPS.map((step, index) => (
                              <li key={step.title} className="grid gap-3 px-4 py-3 sm:grid-cols-[2rem_minmax(0,1fr)]">
                                <span className="font-mono text-xs font-semibold text-accent">{String(index + 1).padStart(2, '0')}</span>
                                <div>
                                  <div className="text-sm font-medium text-foreground">{step.title}</div>
                                  <div className="mt-1 text-xs leading-5 text-muted-foreground">{step.detail}</div>
                                </div>
                              </li>
                            ))}
                          </ol>
                        </div>
                        {pairing.status === 'expired' ? (
                          <Button variant="outline" className="w-full" onClick={() => setPairing(null)}>Create a new QR code</Button>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="glass-panel space-y-5 p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">{source === 'local' ? 'Local capture' : 'Network capture'}</div>
                        <h3 className="mt-2 text-lg font-semibold text-foreground">{source === 'local' ? 'Route a local client through Backchannel' : 'Expose Backchannel on your LAN'}</h3>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {source === 'local' ? 'Use the loopback target in a browser, simulator, desktop app, or command-line client.' : 'Keep both devices on the same network, then enter the target as a manual HTTP proxy.'}
                        </p>
                      </div>
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-hairline bg-white/[0.04]">
                        {source === 'local' ? <Laptop2 className="h-5 w-5 text-accent" /> : <Router className="h-5 w-5 text-accent" />}
                      </div>
                    </div>

                    {!preparedStatus ? (
                      <Button className="w-full" onClick={() => void handlePrepare()} disabled={preparing || !token}>
                        {preparing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                        {preparing ? 'Preparing capture…' : source === 'local' ? 'Start local capture' : 'Prepare LAN capture'}
                      </Button>
                    ) : (
                      <div className="space-y-5">
                        <div className="rounded-xl border border-accent/20 bg-accent/[0.07] p-4">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Proxy target</div>
                          <div className="mt-2 flex flex-wrap items-center gap-3">
                            <code className="font-mono text-lg font-semibold text-accent">{target || 'LAN address unavailable'}</code>
                            <Button variant="outline" size="sm" onClick={() => onCopyToClipboard(target)} disabled={!target}>
                              <Copy className="mr-1.5 h-3.5 w-3.5" />
                              Copy
                            </Button>
                          </div>
                        </div>
                        <ol className="space-y-3 text-sm text-muted-foreground">
                          <li className="flex gap-3"><span className="font-mono text-accent">01</span><span>Set the client HTTP proxy to <strong className="font-medium text-foreground">{target || 'the LAN target above'}</strong>.</span></li>
                          <li className="flex gap-3"><span className="font-mono text-accent">02</span><span>Through that proxy, open <strong className="font-medium text-foreground">mitm.it</strong> and install the certificate for the client platform.</span></li>
                          <li className="flex gap-3"><span className="font-mono text-accent">03</span><span>Open the target app or website and return here to confirm traffic.</span></li>
                        </ol>
                        <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${trafficDetected ? 'border-accent/25 bg-accent/10 text-accent' : 'border-hairline bg-black/15 text-muted-foreground'}`}>
                          {trafficDetected ? <Check className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
                          {trafficDetected ? `Traffic detected from ${connectedClients.join(', ')}` : 'Waiting for a connected client'}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!token ? <div className="rounded-xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">A dashboard token is required before Backchannel can prepare a connection.</div> : null}
                {error ? (
                  <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    <span>{error}</span>
                    <Button variant="outline" size="sm" onClick={() => void handlePrepare()} disabled={preparing || !token}>Retry</Button>
                  </div>
                ) : null}

                {preparedStatus || pairing ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Globe2 className="h-3.5 w-3.5" />
                      {effectiveStatus.running ? `Proxy live on ${effectiveStatus.listen_host}:${port}` : 'Proxy is not running'}
                    </div>
                    <Button onClick={handleOpenWorkspace}>
                      {trafficDetected ? 'Inspect traffic' : 'Open traffic workspace'}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type ConnectionSettingsCardProps = {
  status: MitmStatus
  connectedClients: string[]
  onOpen: () => void
}

export function ConnectionSettingsCard({ status, connectedClients, onOpen }: ConnectionSettingsCardProps) {
  const target = status.lan_ip && status.listen_port ? `${status.lan_ip}:${status.listen_port}` : null
  return (
    <div className="glass-panel flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-hairline bg-white/[0.04]">
          <Network className="h-5 w-5 text-accent" />
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Connection setup</div>
          <div className="mt-1 text-base font-semibold text-foreground">Connect another traffic source</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {connectedClients.length > 0 ? `${connectedClients.length} recent client${connectedClients.length === 1 ? '' : 's'} detected` : target ? `LAN target ${target}` : 'Choose iPhone, local, or manual LAN setup'}
          </div>
        </div>
      </div>
      <Button variant="outline" onClick={onOpen}>
        <Router className="mr-2 h-4 w-4" />
        Open connection setup
      </Button>
    </div>
  )
}
