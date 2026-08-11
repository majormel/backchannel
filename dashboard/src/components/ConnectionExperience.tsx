import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
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
} from 'lucide-react'

import { createMobilePairing, getMobilePairing } from '@/lib/api'
import { IPHONE_PROFILE_INSTALL_STEPS, proxyTargetForSource, type ConnectionSource } from '@/lib/setup'
import type { MitmStatus, MobilePairing } from '@/lib/types'
import { BrandMark } from './layout/BrandMark'
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
  icon: typeof Smartphone
  recommended?: boolean
}

const SOURCE_DEFINITIONS: SourceDefinition[] = [
  {
    source: 'iphone',
    title: 'Pair an iPhone',
    eyebrow: 'One-scan setup',
    detail: 'Create a short-lived Wi-Fi profile with the proxy and certificate bundled together.',
    icon: Smartphone,
    recommended: true,
  },
  {
    source: 'local',
    title: 'This Mac or browser',
    eyebrow: 'Loopback capture',
    detail: 'Start a local proxy for a browser, desktop app, simulator, or command-line client.',
    icon: Laptop2,
  },
  {
    source: 'lan',
    title: 'Another device',
    eyebrow: 'Manual LAN setup',
    detail: 'Expose the proxy on your network and connect any device that supports a manual HTTP proxy.',
    icon: Network,
  },
]

type SourceCardsProps = {
  onChoose: (source: ConnectionSource) => void
  compact?: boolean
}

function SourceCards({ onChoose, compact = false }: SourceCardsProps) {
  return (
    <div className={`grid gap-3 ${compact ? 'md:grid-cols-3' : 'lg:grid-cols-3'}`}>
      {SOURCE_DEFINITIONS.map((definition, index) => {
        const Icon = definition.icon
        return (
          <motion.div
            key={definition.source}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38, delay: 0.08 + index * 0.06, ease: [0.22, 1, 0.36, 1] }}
          >
            <SpotlightCard
              className={`h-full w-full ${definition.recommended ? 'border-accent/25 bg-accent/[0.045] hover:border-accent/40 hover:bg-accent/[0.06]' : ''}`}
              onClick={() => onChoose(definition.source)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                {definition.recommended ? (
                  <span className="rounded-pill border border-accent/20 bg-accent/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-accent">
                    Recommended
                  </span>
                ) : null}
              </div>
              <div className="mt-7 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{definition.eyebrow}</div>
              <div className="mt-2 flex items-center gap-2 text-base font-semibold text-foreground">
                {definition.title}
                <ArrowRight className="h-4 w-4 translate-x-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-accent" />
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{definition.detail}</p>
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
  return (
    <div className="connection-launchpad relative flex min-h-0 flex-1 overflow-auto p-4 sm:p-6 lg:p-10">
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col justify-center py-8">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.44, ease: [0.22, 1, 0.36, 1] }}>
          <div className="inline-flex items-center gap-3">
            <BrandMark className="h-10 w-10 drop-shadow-[0_2px_16px_hsl(219_89%_60%/0.4)]" decorative />
            <div className="text-lg font-semibold tracking-tight text-foreground">Backchannel</div>
          </div>
          <div className="mt-9 max-w-3xl">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-accent">
              <span className="h-px w-8 bg-accent/60" />
              Connect a traffic source
            </div>
            <h1 className="mt-4 text-balance text-4xl font-semibold leading-[1.04] tracking-[-0.045em] text-foreground sm:text-5xl lg:text-6xl">
              Open a channel to the traffic behind your apps.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Choose where requests will come from. Backchannel will prepare the proxy, guide certificate setup, and confirm when traffic arrives.
            </p>
          </div>
        </motion.div>

        <div className="mt-10">
          <SourceCards onChoose={onChoose} />
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.34, duration: 0.3 }}
          className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-hairline pt-5"
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" />
            Local by default. No traffic leaves this machine unless you explicitly send it elsewhere.
          </div>
          <Button variant="ghost" size="sm" onClick={onSkip}>Open an empty workspace</Button>
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
  const [source, setSource] = useState<ConnectionSource | null>(initialSource)
  const [wifiSsid, setWifiSsid] = useState('')
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
        const nextPairing = await createMobilePairing(wifiSsid.trim(), token)
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
      <DialogContent className="connection-drawer left-auto right-0 top-0 flex h-screen w-full max-w-2xl translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-y-0 border-r-0 bg-background/84 p-0 sm:rounded-none">
        <DialogHeader className="shrink-0 border-b border-hairline px-5 py-4 pr-14 sm:px-7 sm:py-5">
          <div className="flex items-center gap-3">
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
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-hairline bg-white/[0.035] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Back to connection sources"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : (
              <BrandMark className="h-10 w-10" decorative />
            )}
            <div>
              <DialogTitle>{selectedDefinition?.title || 'Connect a traffic source'}</DialogTitle>
              <DialogDescription className="mt-1">
                {selectedDefinition?.detail || 'Choose how requests will reach Backchannel.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-7 sm:py-7">
          <AnimatePresence mode="wait" initial={false}>
            {!source ? (
              <motion.div key="sources" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }}>
                <SourceCards onChoose={setSource} compact />
                <div className="mt-6 rounded-xl border border-hairline bg-black/15 px-4 py-3 text-xs leading-5 text-muted-foreground">
                  LAN setup may restart an active loopback proxy so outside devices can reach it. Existing capture files are preserved.
                </div>
              </motion.div>
            ) : (
              <motion.div key={source} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.2 }} className="space-y-5">
                {source === 'iphone' ? (
                  <div className="glass-panel space-y-5 p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">Secure pairing</div>
                        <h3 className="mt-2 text-lg font-semibold text-foreground">Create a Wi-Fi scoped profile</h3>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">The profile carries the proxy target and mitmproxy certificate without exposing your dashboard token.</p>
                      </div>
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-hairline bg-white/[0.04]">
                        <MonitorSmartphone className="h-5 w-5 text-accent" />
                      </div>
                    </div>

                    {!pairing ? (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="connection-wifi-ssid">iPhone Wi-Fi network</Label>
                          <Input id="connection-wifi-ssid" value={wifiSsid} onChange={(event) => setWifiSsid(event.target.value)} placeholder="Exact network name" maxLength={32} />
                          <p className="text-xs leading-5 text-muted-foreground">On the iPhone, open Settings &gt; Wi-Fi and enter the exact network name with the checkmark, including spaces and capitalization. Do not enter the password or an IP address.</p>
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
