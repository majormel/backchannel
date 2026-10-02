import { useMemo } from 'react'
import { ArrowDownLeft, Globe2, Monitor, Radio } from '@/components/ui/icons'
import { computeClientCounts, computeProtocolBreakdown, computeTrafficStats } from '@/lib/flowStats'
import { formatBytes } from '@/lib/flowDisplay'
import type { FlowSummary } from '@/lib/types'

const PROTOCOL_COLORS: Record<string, string> = {
  https: 'hsl(var(--accent))',
  http: 'hsl(var(--aqua))',
  websocket: 'hsl(var(--warning))',
  other: 'hsl(var(--muted-foreground))',
}

function Donut({ segments }: { segments: Array<{ key: string; value: number; color: string }> }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  const circumference = 2 * Math.PI * 28
  let offset = 0
  return (
    <svg viewBox="0 0 72 72" className="h-[72px] w-[72px] shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="36" cy="36" r="28" fill="none" stroke="hsl(var(--surface-3))" strokeWidth="5" />
      {total > 0 ? segments.map((segment) => {
        if (segment.value === 0) return null
        const dash = segment.value / total * circumference
        const circle = <circle key={segment.key} cx="36" cy="36" r="28" fill="none" stroke={segment.color} strokeWidth="5" strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-offset} />
        offset += dash
        return circle
      }) : null}
    </svg>
  )
}

export function MetricsRow({ flows }: { flows: FlowSummary[] }) {
  const stats = useMemo(() => computeTrafficStats(flows), [flows])
  const protocols = useMemo(() => computeProtocolBreakdown(flows), [flows])
  const clients = useMemo(() => computeClientCounts(flows), [flows])
  const segments = ['https', 'http', 'websocket', 'other'].map((key) => ({ key, value: protocols[key as keyof typeof protocols], color: PROTOCOL_COLORS[key] }))

  return (
    <div className="flex shrink-0 gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0" aria-label="Traffic metrics">
      <section className="metric-card glass-subpanel min-w-[220px] flex-1 p-4 sm:min-w-0">
        <div className="terminal-label flex items-center justify-between text-[9px] text-muted-foreground">Exchanges<ArrowDownLeft className="h-3.5 w-3.5 text-accent/70" /></div>
        <div className="mt-3 flex items-baseline gap-2"><span className="text-[30px] font-medium leading-none tracking-[-0.05em] tabular-nums">{stats.requests.toLocaleString()}</span><span className="text-[10px] text-muted-foreground">requests</span></div>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/[0.06] pt-2.5 font-mono text-[9px] text-muted-foreground">
          <span>{formatBytes(stats.totalBytes)} transferred</span>
          <span className={stats.errorCount > 0 ? 'text-destructive' : 'text-accent/70'}>{stats.errorCount} errors</span>
          <span>{stats.responses} responses</span>
        </div>
      </section>
      <section className="metric-card glass-subpanel min-w-[220px] flex-1 p-4 sm:min-w-0">
        <div className="terminal-label flex items-center justify-between text-[9px] text-muted-foreground">Clients in view<Monitor className="h-3.5 w-3.5 text-accent/70" /></div>
        <div className="mt-3 flex items-baseline gap-2"><span className="text-[30px] font-medium leading-none tracking-[-0.05em] tabular-nums">{clients.length.toLocaleString().padStart(2, '0')}</span><span className="text-[10px] text-muted-foreground">sources</span></div>
        <div title={clients.map((client) => `${client.client}: ${client.count} requests`).join('\n')} className="mt-4 flex min-w-0 items-center gap-2 border-t border-white/[0.06] pt-2.5 font-mono text-[9px] text-muted-foreground">
          <Radio className="h-3 w-3 shrink-0 text-accent/60" />
          <span className="truncate">{clients[0] ? `${clients[0].client} · ${clients[0].count}` : 'Awaiting a connection'}</span>
          {clients.length > 1 ? <span className="ml-auto shrink-0 text-accent/70">+{clients.length - 1}</span> : null}
        </div>
      </section>
      <section className="metric-card glass-subpanel min-w-[220px] flex-1 p-4 sm:min-w-0">
        <div className="terminal-label flex items-center justify-between text-[9px] text-muted-foreground">Protocols<Globe2 className="h-3.5 w-3.5 text-accent/70" /></div>
        <div className="mt-3 flex items-center gap-4">
          <Donut segments={segments} />
          <div className="min-w-0 flex-1 space-y-1.5">
            {segments.map((segment) => <div key={segment.key} className="flex items-center gap-1.5 font-mono text-[9px]"><span className="h-1 w-1 shrink-0 rounded-full" style={{ background: segment.color }} /><span className="text-muted-foreground">{segment.key === 'websocket' ? 'WS' : segment.key.toUpperCase()}</span><span className="ml-auto text-foreground/80">{protocols.total ? Math.round(segment.value / protocols.total * 100) : 0}%</span></div>)}
          </div>
        </div>
      </section>
    </div>
  )
}
