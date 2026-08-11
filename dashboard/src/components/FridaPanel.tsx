import { useCallback, useEffect, useRef, useState } from 'react'
import { Bug, ChevronDown, ChevronRight, Cpu, Loader2, MemoryStick, RefreshCw, Scan, Terminal, Trash2, Unplug, X, Zap } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Switch } from './ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import {
  fridaAddHook,
  fridaAttach,
  fridaDetach,
  fridaMemoryScan,
  fridaReadMemory,
  fridaRemoveHook,
  fridaTrace,
  getFridaDevices,
  getFridaHooks,
  getFridaStatus,
} from '@/lib/api'
import type { FridaDevice, FridaEvent, FridaHook, FridaMemoryReadResult, FridaMemoryScanResult, FridaStatus, FridaTraceResult, FlowSummary } from '@/lib/types'

type FridaPanelProps = {
  token: string | null
  flows: FlowSummary[]
}

type MemoryTab = 'scan' | 'read'

const EVENT_TYPE_STYLES: Record<string, string> = {
  call: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  return: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  memory: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
}

function formatTs(ts: number) {
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
    '.' + String(d.getMilliseconds()).padStart(3, '0')
}

function hexDump(hex: string) {
  const chunks: string[] = []
  for (let i = 0; i < hex.length; i += 64) {
    const offset = (i / 2).toString(16).padStart(4, '0')
    const chunk = hex.slice(i, i + 64)
    const bytes = chunk.match(/.{2}/g)?.join(' ') ?? chunk
    chunks.push(`${offset}  ${bytes}`)
  }
  return chunks.join('\n')
}

function CollapsibleJson({ data }: { data: Record<string, unknown> }) {
  const [open, setOpen] = useState(false)
  return (
    <span>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        aria-label={open ? 'Collapse data' : 'Expand data'}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="text-xs">{open ? 'hide' : 'data'}</span>
      </button>
      {open && (
        <pre className="mt-1 rounded bg-black/20 p-2 text-[11px] font-mono text-foreground/70 whitespace-pre-wrap break-all">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </span>
  )
}

export function FridaPanel({ token, flows }: FridaPanelProps) {
  const [status, setStatus] = useState<FridaStatus | null>(null)
  const [hooks, setHooks] = useState<FridaHook[]>([])
  const [devices, setDevices] = useState<FridaDevice[]>([])
  const [selectedDevice, setSelectedDevice] = useState('local')
  const [attachTarget, setAttachTarget] = useState('')
  const [isAttaching, setIsAttaching] = useState(false)
  const [isDetaching, setIsDetaching] = useState(false)

  const [newHookTarget, setNewHookTarget] = useState('')
  const [newHookScriptType, setNewHookScriptType] = useState('generic_tracer')
  const [newHookCaptureArgs, setNewHookCaptureArgs] = useState(true)
  const [newHookCaptureRetval, setNewHookCaptureRetval] = useState(true)
  const [isAddingHook, setIsAddingHook] = useState(false)

  const [traceDuration, setTraceDuration] = useState(5)
  const [isTracing, setIsTracing] = useState(false)
  const [traceResult, setTraceResult] = useState<FridaTraceResult | null>(null)
  const [events, setEvents] = useState<FridaEvent[]>([])

  const [memoryTab, setMemoryTab] = useState<MemoryTab>('scan')
  const [scanPattern, setScanPattern] = useState('')
  const [scanAddress, setScanAddress] = useState('0')
  const [scanSize, setScanSize] = useState(4096)
  const [readAddress, setReadAddress] = useState('')
  const [readSize, setReadSize] = useState(256)
  const [memoryScanResult, setMemoryScanResult] = useState<FridaMemoryScanResult | null>(null)
  const [memoryReadResult, setMemoryReadResult] = useState<FridaMemoryReadResult | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [isReading, setIsReading] = useState(false)

  const [statusMsg, setStatusMsg] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([
        getFridaStatus(token),
        getFridaHooks(token),
      ])
      setStatus(s)
      setHooks(h.hooks)
    } catch {
    }
  }, [token])

  useEffect(() => {
    void refresh()
    getFridaDevices(token).then((r) => setDevices(r.devices)).catch(() => {})
    pollRef.current = setInterval(() => { void refresh() }, 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [refresh, token])

  const handleAttach = async () => {
    if (!attachTarget.trim()) return
    setIsAttaching(true)
    setStatusMsg('')
    try {
      const res = await fridaAttach(attachTarget.trim(), selectedDevice, token)
      if (res.error) {
        setStatusMsg(res.error)
      } else {
        setStatusMsg(`Attached to ${res.process} on ${res.device}`)
        void refresh()
      }
    } catch (e) {
      setStatusMsg((e as Error).message)
    } finally {
      setIsAttaching(false)
    }
  }

  const handleDetach = async () => {
    setIsDetaching(true)
    setStatusMsg('')
    try {
      await fridaDetach(token)
      setStatusMsg('Detached')
      void refresh()
    } catch (e) {
      setStatusMsg((e as Error).message)
    } finally {
      setIsDetaching(false)
    }
  }

  const handleAddHook = async () => {
    if (!newHookTarget.trim()) return
    setIsAddingHook(true)
    setStatusMsg('')
    try {
      const res = await fridaAddHook(newHookTarget.trim(), newHookCaptureArgs, newHookCaptureRetval, newHookScriptType, token)
      if (res.error) {
        setStatusMsg(res.error)
      } else {
        setNewHookTarget('')
        setStatusMsg(`Hook added: ${res.hook_id}`)
        void refresh()
      }
    } catch (e) {
      setStatusMsg((e as Error).message)
    } finally {
      setIsAddingHook(false)
    }
  }

  const handleRemoveHook = async (hookId: string) => {
    try {
      await fridaRemoveHook(hookId, token)
      void refresh()
    } catch (e) {
      setStatusMsg((e as Error).message)
    }
  }

  const handleTrace = async () => {
    setIsTracing(true)
    setStatusMsg(`Tracing for ${traceDuration}s…`)
    setTraceResult(null)
    try {
      const res = await fridaTrace(traceDuration, token)
      if (res.error) {
        setStatusMsg(res.error)
      } else {
        setTraceResult(res)
        setEvents(res.events)
        setStatusMsg(`Captured ${res.event_count} events`)
        void refresh()
      }
    } catch (e) {
      setStatusMsg((e as Error).message)
    } finally {
      setIsTracing(false)
    }
  }

  const handleMemoryScan = async () => {
    if (!scanPattern.trim()) return
    setIsScanning(true)
    setStatusMsg('')
    try {
      const res = await fridaMemoryScan(scanPattern.trim(), scanAddress, scanSize, token)
      if (res.error) {
        setStatusMsg(res.error)
      } else {
        setMemoryScanResult(res)
        setStatusMsg(`Found ${res.matches.length} match${res.matches.length === 1 ? '' : 'es'}`)
      }
    } catch (e) {
      setStatusMsg((e as Error).message)
    } finally {
      setIsScanning(false)
    }
  }

  const handleMemoryRead = async () => {
    if (!readAddress.trim()) return
    setIsReading(true)
    setStatusMsg('')
    try {
      const res = await fridaReadMemory(readAddress.trim(), readSize, token)
      if (res.error) {
        setStatusMsg(res.error)
      } else {
        setMemoryReadResult(res)
        setStatusMsg(`Read ${res.size} bytes from ${res.address}`)
      }
    } catch (e) {
      setStatusMsg((e as Error).message)
    } finally {
      setIsReading(false)
    }
  }

  const correlateWithFlows = () => {
    if (!events.length || !flows.length) {
      setStatusMsg('No events or flows to correlate')
      return
    }
    const windowS = 0.5
    let matched = 0
    for (const evt of events) {
      let best: FlowSummary | null = null
      let bestDelta = Infinity
      for (const flow of flows) {
        const delta = Math.abs(evt.timestamp - flow.ts)
        if (delta < windowS && delta < bestDelta) {
          bestDelta = delta
          best = flow
        }
      }
      if (best) {
        evt.correlated_flow_id = best.id
        matched++
      }
    }
    setEvents([...events])
    setStatusMsg(`Correlated ${matched} event${matched === 1 ? '' : 's'} with flows`)
  }

  const attached = status?.session?.attached ?? false
  const fridaAvailable = status?.frida_available ?? true

  return (
    <Card className="glass-panel overflow-hidden">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Dynamic instrumentation</div>
            <CardTitle className="mt-2 text-[1.35rem]">Frida hook & trace</CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!fridaAvailable && (
              <span className="rounded-full border border-red-500/25 bg-red-500/10 px-2.5 py-1 text-xs text-red-300">
                Frida not installed
              </span>
            )}
            {fridaAvailable && (
              <span className={`rounded-full border px-2.5 py-1 text-xs ${attached ? 'border-emerald-300/15 bg-emerald-300/12 text-emerald-200' : 'border-hairline bg-white/[0.04] text-muted-foreground'}`}>
                {attached ? `Attached · ${status?.session.process_name}` : 'Detached'}
              </span>
            )}
            {attached && status?.session.device_name && (
              <span className="rounded-full border border-hairline bg-white/[0.04] px-2.5 py-1 text-xs text-muted-foreground">
                {status.session.device_name}
              </span>
            )}
            <span className="rounded-full border border-hairline bg-white/[0.04] px-2.5 py-1 text-xs text-muted-foreground">
              {status?.hook_count ?? 0} hooks
            </span>
            <span className="rounded-full border border-hairline bg-white/[0.04] px-2.5 py-1 text-xs text-muted-foreground">
              {status?.event_count ?? 0} events
            </span>
            <Button variant="outline" size="sm" onClick={refresh} className="rounded-full" aria-label="Refresh Frida status">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="glass-subpanel rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Unplug className="h-3.5 w-3.5 text-accent" />
              Connect
            </div>
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label htmlFor="frida-device" className="text-xs text-muted-foreground mb-1 block">Device</Label>
                  <select
                    id="frida-device"
                    value={selectedDevice}
                    onChange={(e) => setSelectedDevice(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    aria-label="Select Frida device"
                  >
                    <option value="local">Local</option>
                    <option value="usb">USB</option>
                    {devices.filter(d => d.id !== 'local' && d.type !== 'usb').map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <Label htmlFor="frida-target" className="text-xs text-muted-foreground mb-1 block">Process name or PID</Label>
                  <Input
                    id="frida-target"
                    placeholder="e.g. com.app.game or 1234"
                    value={attachTarget}
                    onChange={(e) => setAttachTarget(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAttach()}
                    className="text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleAttach}
                  disabled={isAttaching || !attachTarget.trim()}
                  className="flex-1"
                  aria-label="Attach Frida to process"
                >
                  {isAttaching ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Bug className="mr-1.5 h-3.5 w-3.5" />}
                  Attach
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDetach}
                  disabled={isDetaching || !attached}
                  className="flex-1"
                  aria-label="Detach Frida from process"
                >
                  {isDetaching ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <X className="mr-1.5 h-3.5 w-3.5" />}
                  Detach
                </Button>
              </div>
            </div>
          </div>

          <div className="glass-subpanel rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Zap className="h-3.5 w-3.5 text-accent" />
              Trace
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Label htmlFor="frida-duration" className="text-xs text-muted-foreground whitespace-nowrap">
                  Duration: <span className="font-medium text-foreground">{traceDuration}s</span>
                </Label>
                <input
                  id="frida-duration"
                  type="range"
                  min={1}
                  max={30}
                  value={traceDuration}
                  onChange={(e) => setTraceDuration(Number(e.target.value))}
                  className="flex-1 accent-primary"
                  aria-label="Trace duration in seconds"
                />
              </div>
              <Button
                size="sm"
                onClick={handleTrace}
                disabled={isTracing || !attached}
                className="w-full"
                aria-label="Start Frida trace"
              >
                {isTracing ? (
                  <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Tracing…</>
                ) : (
                  <><Terminal className="mr-1.5 h-3.5 w-3.5" />Start Trace</>
                )}
              </Button>
              {traceResult && (
                <div className="text-xs text-muted-foreground">
                  Captured <span className="font-medium text-foreground">{traceResult.event_count}</span> events in {traceResult.duration}s
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="glass-subpanel rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Cpu className="h-3.5 w-3.5 text-accent" />
            Hooks
          </div>
          {hooks.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">ID</TableHead>
                  <TableHead className="text-xs">Target</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Calls</TableHead>
                  <TableHead className="text-xs w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {hooks.map((hook) => (
                  <TableRow key={hook.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{hook.id.slice(0, 8)}</TableCell>
                    <TableCell className="font-mono text-xs">{hook.target}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{hook.capture_args ? 'args' : ''}{hook.capture_args && hook.capture_retval ? '+' : ''}{hook.capture_retval ? 'ret' : ''}</TableCell>
                    <TableCell className="text-xs font-medium">{hook.call_count}</TableCell>
                    <TableCell>
                      <button
                        onClick={() => handleRemoveHook(hook.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        aria-label={`Remove hook ${hook.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">No hooks active</p>
          )}
          <div className="flex flex-wrap gap-2 pt-1 border-t border-border/40">
            <Input
              placeholder="Symbol or 0xADDR"
              value={newHookTarget}
              onChange={(e) => setNewHookTarget(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddHook()}
              className="text-xs flex-1 min-w-[120px]"
              aria-label="Hook target symbol or address"
            />
            <select
              value={newHookScriptType}
              onChange={(e) => setNewHookScriptType(e.target.value)}
              className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label="Hook script type"
            >
              <option value="generic_tracer">generic_tracer</option>
              <option value="crypto_hooks">crypto_hooks</option>
              <option value="session_c_hook">session_c_hook</option>
            </select>
            <div className="flex items-center gap-1.5 text-xs">
              <Switch
                id="capture-args"
                checked={newHookCaptureArgs}
                onCheckedChange={setNewHookCaptureArgs}
                aria-label="Capture arguments"
              />
              <Label htmlFor="capture-args" className="text-xs cursor-pointer">args</Label>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <Switch
                id="capture-retval"
                checked={newHookCaptureRetval}
                onCheckedChange={setNewHookCaptureRetval}
                aria-label="Capture return value"
              />
              <Label htmlFor="capture-retval" className="text-xs cursor-pointer">retval</Label>
            </div>
            <Button
              size="sm"
              onClick={handleAddHook}
              disabled={isAddingHook || !newHookTarget.trim() || !attached}
              aria-label="Add Frida hook"
            >
              {isAddingHook ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '+ Add'}
            </Button>
          </div>
        </div>

        {events.length > 0 && (
          <div className="glass-subpanel rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Terminal className="h-3.5 w-3.5 text-accent" />
                Event log
                <span className="rounded-full border border-hairline bg-white/[0.04] px-2 py-0.5 text-xs text-muted-foreground">
                  {events.length}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={correlateWithFlows}
                  disabled={!flows.length}
                  className="rounded-full text-xs"
                  aria-label="Correlate Frida events with captured flows"
                >
                  Correlate with flows
                </Button>
                <button
                  onClick={() => setEvents([])}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Clear event log"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="max-h-[320px] overflow-auto space-y-1">
              {events.map((evt, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.02] text-xs">
                  <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${EVENT_TYPE_STYLES[evt.event_type] ?? 'border-hairline bg-white/[0.04] text-muted-foreground'}`}>
                    {evt.event_type}
                  </span>
                  <span className="font-mono text-muted-foreground shrink-0">{evt.hook_id.slice(0, 8)}</span>
                  <span className="text-muted-foreground/60 shrink-0">{formatTs(evt.timestamp)}</span>
                  {evt.correlated_flow_id && (
                    <span className="rounded border border-blue-500/25 bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-300 shrink-0">
                      flow:{evt.correlated_flow_id.slice(0, 8)}
                    </span>
                  )}
                  {Object.keys(evt.data).length > 0 && <CollapsibleJson data={evt.data} />}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="glass-subpanel rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <MemoryStick className="h-3.5 w-3.5 text-accent" />
            Memory
          </div>
          <div className="flex gap-1.5">
            {(['scan', 'read'] as MemoryTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setMemoryTab(tab)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${memoryTab === tab ? 'border-accent/50 bg-accent/15 text-accent' : 'border-hairline bg-white/[0.04] text-muted-foreground hover:text-foreground'}`}
                aria-pressed={memoryTab === tab}
              >
                {tab === 'scan' ? <><Scan className="inline h-3 w-3 mr-1" />Scan</> : <><MemoryStick className="inline h-3 w-3 mr-1" />Read</>}
              </button>
            ))}
          </div>

          {memoryTab === 'scan' && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Pattern: 48 8b 05 ?? ?? ?? ??"
                  value={scanPattern}
                  onChange={(e) => setScanPattern(e.target.value)}
                  className="text-xs flex-1"
                  aria-label="Memory scan byte pattern"
                />
                <Input
                  placeholder="0x0"
                  value={scanAddress}
                  onChange={(e) => setScanAddress(e.target.value)}
                  className="text-xs w-28"
                  aria-label="Start address for scan"
                />
                <Input
                  type="number"
                  placeholder="4096"
                  value={scanSize}
                  onChange={(e) => setScanSize(Number(e.target.value))}
                  className="text-xs w-20"
                  aria-label="Scan size in bytes"
                />
                <Button
                  size="sm"
                  onClick={handleMemoryScan}
                  disabled={isScanning || !attached || !scanPattern.trim()}
                  aria-label="Run memory scan"
                >
                  {isScanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Scan'}
                </Button>
              </div>
              {memoryScanResult && (
                <div className="max-h-[200px] overflow-auto rounded bg-black/20 p-2 text-[11px] font-mono">
                  {memoryScanResult.matches.length === 0 ? (
                    <span className="text-muted-foreground">No matches found</span>
                  ) : (
                    memoryScanResult.matches.map((m, i) => (
                      <div key={i} className="text-foreground/80">{JSON.stringify(m)}</div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {memoryTab === 'read' && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="0x7ff8001234"
                  value={readAddress}
                  onChange={(e) => setReadAddress(e.target.value)}
                  className="text-xs flex-1"
                  aria-label="Memory read address"
                />
                <Input
                  type="number"
                  placeholder="256"
                  value={readSize}
                  onChange={(e) => setReadSize(Number(e.target.value))}
                  className="text-xs w-20"
                  aria-label="Number of bytes to read"
                />
                <Button
                  size="sm"
                  onClick={handleMemoryRead}
                  disabled={isReading || !attached || !readAddress.trim()}
                  aria-label="Read memory"
                >
                  {isReading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Read'}
                </Button>
              </div>
              {memoryReadResult && (
                <pre className="max-h-[200px] overflow-auto rounded bg-black/20 p-2 text-[11px] font-mono text-foreground/80 whitespace-pre">
                  {hexDump(memoryReadResult.hex)}
                </pre>
              )}
            </div>
          )}
        </div>

        {statusMsg && (
          <p className="text-xs text-muted-foreground border-t border-border/40 pt-3">{statusMsg}</p>
        )}
      </CardContent>
    </Card>
  )
}
