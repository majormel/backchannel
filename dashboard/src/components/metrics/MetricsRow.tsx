import { useMemo } from 'react'
import { Monitor } from 'lucide-react'

import { computeClientCounts, computeProtocolBreakdown, computeTrafficStats } from '@/lib/flowStats'
import { formatBytes } from '@/lib/flowDisplay'
import type { FlowSummary } from '@/lib/types'

const PROTOCOL_COLORS: Record<string, string> = {
  https: 'hsl(var(--accent))',
  http: 'hsl(220 10% 78%)',
  websocket: 'hsl(187 55% 52%)',
  other: 'hsl(var(--muted-foreground))',
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-subpanel flex min-w-0 flex-col p-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</div>
      {children}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-lg font-semibold text-foreground">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  )
}

function Donut({ segments }: { segments: Array<{ key: string; value: number; color: string }> }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  const radius = 30
  const circumference = 2 * Math.PI * radius
  let offset = 0
  return (
    <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
      <circle cx="40" cy="40" r={radius} fill="none" stroke="hsl(var(--surface-3))" strokeWidth="10" />
      {total > 0 &&
        segments.map((segment) => {
          if (segment.value === 0) return null
          const fraction = segment.value / total
          const dash = fraction * circumference
          const circle = (
            <circle
              key={segment.key}
              cx="40"
              cy="40"
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth="10"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
            />
          )
          offset += dash
          return circle
        })}
    </svg>
  )
}

type MetricsRowProps = {
  flows: FlowSummary[]
}

export function MetricsRow({ flows }: MetricsRowProps) {
  const stats = useMemo(() => computeTrafficStats(flows), [flows])
  const protocols = useMemo(() => computeProtocolBreakdown(flows), [flows])
  const clients = useMemo(() => computeClientCounts(flows), [flows])

  const segments = [
    { key: 'https', value: protocols.https, color: PROTOCOL_COLORS.https },
    { key: 'http', value: protocols.http, color: PROTOCOL_COLORS.http },
    { key: 'websocket', value: protocols.websocket, color: PROTOCOL_COLORS.websocket },
    { key: 'other', value: protocols.other, color: PROTOCOL_COLORS.other },
  ]

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <Panel title="Traffic Summary">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Requests" value={String(stats.requests)} />
          <Stat label="Responses" value={String(stats.responses)} />
          <Stat label="Total size" value={formatBytes(stats.totalBytes)} />
          <Stat label="Errors" value={String(stats.errorCount)} />
        </div>
      </Panel>

      <Panel title="Connected Clients">
        {clients.length === 0 ? (
          <div className="flex flex-1 items-center text-xs text-muted-foreground">No clients yet</div>
        ) : (
          <div className="space-y-1.5">
            {clients.slice(0, 5).map((entry) => (
              <div key={entry.client} className="flex items-center gap-2">
                <Monitor className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate font-mono text-xs text-foreground/85">{entry.client}</span>
                <span className="ml-auto font-mono text-xs text-accent">{entry.count}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Protocol Distribution">
        <div className="flex items-center gap-4">
          <Donut segments={segments} />
          <div className="space-y-1">
            {segments.map((segment) => {
              const pct = protocols.total ? Math.round((segment.value / protocols.total) * 100) : 0
              return (
                <div key={segment.key} className="flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 rounded-sm" style={{ background: segment.color }} />
                  <span className="capitalize text-muted-foreground">{segment.key}</span>
                  <span className="ml-auto font-mono text-foreground/80">{pct}%</span>
                </div>
              )
            })}
          </div>
        </div>
      </Panel>
    </div>
  )
}
