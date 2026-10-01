import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Play, RefreshCw, Router, SlidersHorizontal, Square, Trash2, Waves } from '@/components/ui/icons'

import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Switch } from './ui/switch'
import type { MitmStatus } from '@/lib/types'

type CommandDeckProps = {
  token: string
  status: MitmStatus
  listenHost: string
  listenPort: number
  mode: string
  capturePath: string
  maxBodyBytes: number
  autoRefresh: boolean
  refreshInterval: number
  filterDecodeProto: boolean
  activityLabel: string
  message: string
  connectedClients: string[]
  killingPid: number | null
  onTokenChange: (value: string) => void
  onListenHostChange: (value: string) => void
  onListenPortChange: (value: number) => void
  onModeChange: (value: string) => void
  onCapturePathChange: (value: string) => void
  onMaxBodyBytesChange: (value: number) => void
  onAutoRefreshChange: (value: boolean) => void
  onRefreshIntervalChange: (value: number) => void
  onDecodeProtoChange: (value: boolean) => void
  onRefreshStatus: () => void
  onStart: () => void
  onTail: () => void
  onStop: () => void
  onClear: () => void
  onUseLanHost: () => void
  onKillProcess: (pid: number) => void
}

function StatusMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-foreground/88" title={value}>{value}</div>
    </div>
  )
}

export function CommandDeck({
  token,
  status,
  listenHost,
  listenPort,
  mode,
  capturePath,
  maxBodyBytes,
  autoRefresh,
  refreshInterval,
  filterDecodeProto,
  activityLabel,
  message,
  connectedClients,
  killingPid,
  onTokenChange,
  onListenHostChange,
  onListenPortChange,
  onModeChange,
  onCapturePathChange,
  onMaxBodyBytesChange,
  onAutoRefreshChange,
  onRefreshIntervalChange,
  onDecodeProtoChange,
  onRefreshStatus,
  onStart,
  onTail,
  onStop,
  onClear,
  onUseLanHost,
  onKillProcess,
}: CommandDeckProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const indexedCount = status.index_progress?.indexed ?? 0
  const indexTotal = status.index_progress?.total ?? 0
  const indexPercent = indexTotal > 0 ? Math.min(100, Math.round((indexedCount / indexTotal) * 100)) : 0
  const proxyAddress = `${status.listen_host || listenHost || '-'}:${status.listen_port || listenPort || '-'}`

  return (
    <Card className={`glass-panel overflow-hidden ${status.running ? 'capture-live' : ''}`}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
              status.running
                ? 'border-emerald-400/30 bg-emerald-400/12 text-emerald-500 dark:text-emerald-200'
                : 'border-[var(--glass-edge)] bg-[hsl(var(--glass-tint)/0.34)] text-muted-foreground'
            }`}>
              <Waves className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold text-foreground">Capture session</div>
                <span className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-semibold ${
                  status.running
                    ? 'bg-emerald-400/12 text-emerald-500 dark:text-emerald-200'
                    : 'bg-[hsl(var(--foreground)/0.06)] text-muted-foreground'
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${status.running ? 'bg-emerald-400' : 'bg-slate-400/70'}`} />
                  {status.running ? 'Live' : 'Stopped'}
                </span>
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground" title={message}>{message}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={onStart} disabled={status.running}>
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Start
            </Button>
            <Button variant="secondary" size="sm" onClick={onTail}>
              <Waves className="mr-1.5 h-3.5 w-3.5" />
              Tail
            </Button>
            <Button variant="outline" size="sm" onClick={onStop} disabled={!status.running}>
              <Square className="mr-1.5 h-3.5 w-3.5" />
              Stop
            </Button>
            <Button variant="destructive" size="sm" onClick={onClear}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Clear
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSettingsOpen((open) => !open)}
              aria-expanded={settingsOpen}
            >
              <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
              Settings
              <ChevronDown className={`ml-1 h-3.5 w-3.5 transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[hsl(var(--border)/0.55)] pt-4 sm:grid-cols-4">
          <StatusMetric label="Activity" value={activityLabel} />
          <StatusMetric label="Proxy" value={proxyAddress} />
          <StatusMetric label="Devices" value={`${connectedClients.length} recent`} />
          <StatusMetric label="Refresh" value={autoRefresh ? `Polling every ${refreshInterval}s` : 'Live updates'} />
        </div>

        <AnimatePresence initial={false}>
          {settingsOpen ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-5 space-y-4 border-t border-[hsl(var(--border)/0.55)] pt-5">
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="token">Dashboard token</Label>
                    <Input id="token" value={token} onChange={(event) => onTokenChange(event.target.value)} placeholder="token for API" />
                  </div>
                  <div className="space-y-2 lg:col-span-2">
                    <Label htmlFor="capture-path">Capture path</Label>
                    <Input id="capture-path" value={capturePath} onChange={(event) => onCapturePathChange(event.target.value)} placeholder="~/.mitmproxy/backchannel_flows.jsonl" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="listen-host">Listen host</Label>
                    <Input id="listen-host" value={listenHost} onChange={(event) => onListenHostChange(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="listen-port">Listen port</Label>
                    <Input id="listen-port" type="number" value={listenPort} onChange={(event) => onListenPortChange(Number(event.target.value))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mode">Mode</Label>
                    <Input id="mode" value={mode} onChange={(event) => onModeChange(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max-body">Max body bytes</Label>
                    <Input id="max-body" type="number" value={maxBodyBytes} onChange={(event) => onMaxBodyBytesChange(Number(event.target.value))} />
                    <div className="text-xs text-muted-foreground">Use 0 for unlimited request and response bodies.</div>
                  </div>
                </div>

                <div className="glass-soft flex flex-wrap items-center gap-4 px-4 py-3">
                  <Button variant="outline" size="sm" onClick={onUseLanHost}>
                    <Router className="mr-1.5 h-3.5 w-3.5" />
                    Use LAN host
                  </Button>
                  <Button variant="ghost" size="sm" onClick={onRefreshStatus}>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Refresh status
                  </Button>
                  <div className="flex items-center gap-2">
                    <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={onAutoRefreshChange} />
                    <Label htmlFor="auto-refresh">Polling fallback</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch id="decode-proto" checked={filterDecodeProto} onCheckedChange={onDecodeProtoChange} />
                    <Label htmlFor="decode-proto">Decode proto</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="interval">Interval</Label>
                    <Input id="interval" type="number" value={refreshInterval} onChange={(event) => onRefreshIntervalChange(Number(event.target.value))} className="w-20" />
                    <span className="text-sm text-muted-foreground">sec</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {status.index_progress && indexTotal > 0 ? (
          <div className="mt-4 space-y-2 rounded-xl border border-blue-300/15 bg-blue-300/10 px-4 py-3">
            <div className="flex items-center justify-between text-sm text-blue-50">
              <span>Indexing capture file</span>
              <span>{indexedCount}/{indexTotal}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-blue-100/15">
              <div className="h-full rounded-full bg-blue-300/80" style={{ width: `${indexPercent}%` }} />
            </div>
          </div>
        ) : null}

        {status.orphan_processes && status.orphan_processes.length > 0 ? (
          <div className="mt-4 space-y-3 rounded-xl border border-amber-300/15 bg-amber-300/10 p-4">
            <div className="text-sm font-semibold text-amber-50">Orphan mitmdump processes</div>
            {status.orphan_processes.map((proc) => (
              <div key={proc.pid} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-50/10 bg-black/10 px-4 py-3 text-sm">
                <div className="space-y-1 text-amber-50/90">
                  <div>PID {proc.pid}</div>
                  <div className="text-xs text-amber-50/60">{proc.command}</div>
                </div>
                <Button variant="destructive" size="sm" onClick={() => onKillProcess(proc.pid)} disabled={killingPid === proc.pid}>
                  {killingPid === proc.pid ? 'Killing…' : 'Kill'}
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
