import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { ArrowUpDown, Clock, Globe, Shield, Zap, Download, Timer, Info } from '@/components/ui/icons'

import type { Flow, FlowSummary, FlowTiming } from '@/lib/types'

type TimingSegment = {
  key: keyof FlowTiming
  label: string
  color: string
  icon: React.ReactNode
}

const TIMING_SEGMENTS: TimingSegment[] = [
  {
    key: 'dns_lookup_ms',
    label: 'DNS',
    color: 'hsl(270 80% 60%)',
    icon: <Globe className="w-3 h-3" />,
  },
  {
    key: 'tcp_connect_ms',
    label: 'TCP',
    color: 'hsl(210 90% 55%)',
    icon: <Zap className="w-3 h-3" />,
  },
  {
    key: 'tls_handshake_ms',
    label: 'TLS',
    color: 'hsl(45 90% 50%)',
    icon: <Shield className="w-3 h-3" />,
  },
  {
    key: 'time_to_first_byte_ms',
    label: 'Waiting',
    color: 'hsl(25 90% 55%)',
    icon: <Clock className="w-3 h-3" />,
  },
  {
    key: 'download_ms',
    label: 'Download',
    color: 'hsl(140 70% 50%)',
    icon: <Download className="w-3 h-3" />,
  },
]

type TimingBarProps = {
  flow: Flow | FlowSummary
  maxDuration: number
  index: number
}

function getTimingTotal(timing?: FlowTiming): number {
  if (!timing) {
    return 0
  }

  if ((timing.total_duration_ms || 0) > 0) {
    return timing.total_duration_ms || 0
  }

  return TIMING_SEGMENTS.reduce((sum, segment) => sum + (timing[segment.key] || 0), 0)
}

function hasTimingData(flow: Flow | FlowSummary): boolean {
  return getTimingTotal(flow.timing) > 0
}

function TimingBar({ flow, maxDuration, index }: TimingBarProps) {
  const timing = flow.timing
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null)

  if (!timing) {
    return null
  }

  const total = getTimingTotal(timing)
  const scale = maxDuration > 0 ? 100 / maxDuration : 0

  const segments = useMemo(() => {
    const result: Array<{ key: string; label: string; value: number; color: string; left: number; width: number; icon: React.ReactNode }> = []
    let currentLeft = 0

    for (const segment of TIMING_SEGMENTS) {
      const value = timing[segment.key]
      if (value && value > 0) {
        const width = value * scale
        result.push({
          key: segment.key,
          label: segment.label,
          value,
          color: segment.color,
          left: currentLeft,
          width: Math.max(width, 0.5),
          icon: segment.icon,
        })
        currentLeft += width
      }
    }

    return result
  }, [timing, scale])

  return (
    <div className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/50">
      <div className="w-6 text-xs text-muted-foreground">{index + 1}</div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded bg-accent/10 px-1.5 py-0.5 text-xs font-medium text-accent">
            {flow.request.method}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {flow.request.host}{flow.request.path}
          </span>
        </div>
        <div className="relative h-5 overflow-hidden rounded bg-muted/50">
          {segments.map((segment, segmentIndex) => (
            <motion.div
              key={segment.key}
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: `${segment.width}%`, opacity: 1 }}
              transition={{ duration: 0.4, delay: segmentIndex * 0.05, ease: 'easeOut' }}
              className="group absolute top-0 h-full cursor-pointer"
              style={{
                left: `${segment.left}%`,
                backgroundColor: segment.color,
              }}
              onMouseEnter={() => setHoveredSegment(segment.key)}
              onMouseLeave={() => setHoveredSegment(null)}
            >
              {segment.width > 8 ? (
                <div className="flex h-full items-center justify-center text-[8px] font-medium text-white/90 drop-shadow-md">
                  {segment.label}
                </div>
              ) : null}
              {hoveredSegment === segment.key ? (
                <div className="absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded border border-border bg-popover px-2 py-1 shadow-lg">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span style={{ color: segment.color }}>{segment.icon}</span>
                    <span className="font-medium">{segment.label}:</span>
                    <span>{segment.value.toFixed(2)}ms</span>
                  </div>
                </div>
              ) : null}
            </motion.div>
          ))}
        </div>
      </div>
      <div className="min-w-[80px] text-right text-xs font-mono">
        <div className="flex items-center justify-end gap-1 text-muted-foreground">
          <Timer className="w-3 h-3" />
          {total > 0 ? `${total.toFixed(0)}ms` : '-'}
        </div>
      </div>
    </div>
  )
}

type TimingWaterfallProps = {
  flows: Array<Flow | FlowSummary>
  maxItems?: number
}

export function TimingWaterfall({ flows, maxItems = 50 }: TimingWaterfallProps) {
  const [sortByDuration, setSortByDuration] = useState(false)

  const processedFlows = useMemo(() => {
    let result = flows.filter(hasTimingData)
    if (sortByDuration) {
      result = [...result].sort((a, b) => getTimingTotal(b.timing) - getTimingTotal(a.timing))
    } else {
      result = result.slice(0, maxItems)
    }
    return result
  }, [flows, maxItems, sortByDuration])

  const maxDuration = useMemo(() => {
    return Math.max(...processedFlows.map((flow) => getTimingTotal(flow.timing)), 1)
  }, [processedFlows])

  const legendItems = TIMING_SEGMENTS.filter((segment) =>
    processedFlows.some((flow) => (flow.timing?.[segment.key] || 0) > 0)
  )

  const missingTimingCount = flows.length - processedFlows.length
  const recentHosts = Array.from(
    new Set(
      flows
        .filter((flow) => !hasTimingData(flow))
        .map((flow) => flow.request.host || 'Unknown host')
        .filter(Boolean)
    )
  ).slice(0, 4)

  if (processedFlows.length === 0) {
    if (flows.length === 0) {
      return (
        <div className="p-8 text-center text-muted-foreground">
          <Clock className="mx-auto mb-3 h-8 w-8 opacity-50" />
          <p className="text-sm">No timing data available</p>
          <p className="mt-1 text-xs">Capture new flows to see timing breakdown</p>
        </div>
      )
    }

    return (
      <div className="space-y-4 rounded-xl border border-hairline bg-white/[0.04] p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-hairline bg-white/[0.06]">
            <Info className="h-5 w-5 text-accent" />
          </div>
          <div>
            <div className="text-sm font-medium text-foreground">Recent flows are loaded, but phase timing is missing</div>
            <p className="mt-1 text-sm text-muted-foreground">
              This window has {flows.length} captured flows, and none of them include DNS, TCP, TLS, waiting, or download timing yet.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-hairline bg-white/[0.03] px-3 py-1.5 text-foreground/80">
            {flows.length} flows loaded
          </span>
          {recentHosts.map((host) => (
            <span key={host} className="rounded-full border border-hairline bg-white/[0.03] px-3 py-1.5 text-muted-foreground">
              {host}
            </span>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-hairline bg-white/[0.03] p-4 text-sm text-muted-foreground">
            Tail fresh traffic after the proxy is running to populate the next timing window.
          </div>
          <div className="rounded-lg border border-hairline bg-white/[0.03] p-4 text-sm text-muted-foreground">
            Flow detail still works here, so you can inspect headers and bodies while timing metadata is unavailable.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Timing Breakdown</span>
          <span className="text-xs text-muted-foreground">
            {processedFlows.length} flows
          </span>
        </div>
        <button
          type="button"
          onClick={() => setSortByDuration(!sortByDuration)}
          aria-pressed={sortByDuration}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowUpDown className="w-3 h-3" />
          {sortByDuration ? 'Sort by time' : 'Sort by duration'}
        </button>
      </div>

      {missingTimingCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-white/[0.03] px-4 py-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/84">Showing {processedFlows.length}</span>
          <span>of {flows.length} flows with timing metadata</span>
        </div>
      ) : null}

      {legendItems.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {legendItems.map((item) => (
            <div key={item.key} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-muted-foreground">{item.label}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border bg-card/50">
        <div className="max-h-[400px] overflow-auto">
          {processedFlows.map((flow, index) => (
            <TimingBar
              key={flow.id}
              flow={flow}
              maxDuration={maxDuration}
              index={index}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>Max: {maxDuration.toFixed(0)}ms</span>
        <span>
          Avg: {(processedFlows.reduce((sum, flow) => sum + getTimingTotal(flow.timing), 0) / processedFlows.length).toFixed(0)}ms
        </span>
      </div>
    </div>
  )
}

export function FlowTimingDetail({ flow }: { flow: Flow | FlowSummary }) {
  const timing = flow.timing
  const total = getTimingTotal(timing)

  if (!timing || total <= 0) {
    return (
      <div className="rounded-xl border border-hairline bg-white/[0.04] p-5 text-center text-muted-foreground">
        <Clock className="mx-auto mb-3 h-6 w-6 opacity-50" />
        <p className="text-sm font-medium text-foreground/82">Timing phases were not captured for this flow</p>
        <p className="mt-1 text-xs">
          Request and response data are available, but DNS, TCP, TLS, waiting, and download metrics are missing.
        </p>
      </div>
    )
  }

  const segments = [
    { key: 'dns_lookup_ms', label: 'DNS Lookup', color: 'hsl(270 80% 60%)', icon: <Globe className="w-4 h-4" /> },
    { key: 'tcp_connect_ms', label: 'TCP Connect', color: 'hsl(210 90% 55%)', icon: <Zap className="w-4 h-4" /> },
    { key: 'tls_handshake_ms', label: 'TLS Handshake', color: 'hsl(45 90% 50%)', icon: <Shield className="w-4 h-4" /> },
    { key: 'time_to_first_byte_ms', label: 'Time to First Byte', color: 'hsl(25 90% 55%)', icon: <Clock className="w-4 h-4" /> },
    { key: 'download_ms', label: 'Download', color: 'hsl(140 70% 50%)', icon: <Download className="w-4 h-4" /> },
  ] as const

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium">Total Duration</span>
        </div>
        <span className="text-lg font-mono font-semibold">
          {total.toFixed(2)}ms
        </span>
      </div>

      <div className="space-y-2">
        {segments.map((segment) => {
          const value = timing[segment.key]
          if (value == null || value <= 0) {
            return null
          }

          const percentage = total > 0 ? (value / total) * 100 : 0

          return (
            <div key={segment.key} className="flex items-center gap-3 rounded p-2 transition-colors hover:bg-muted/30">
              <div className="flex w-36 items-center gap-2 text-sm">
                <span style={{ color: segment.color }}>{segment.icon}</span>
                <span className="text-muted-foreground">{segment.label}</span>
              </div>
              <div className="flex-1">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: segment.color }}
                  />
                </div>
              </div>
              <div className="w-24 text-right">
                <span className="text-sm font-mono">{value.toFixed(2)}ms</span>
              </div>
              <div className="w-12 text-right">
                <span className="text-xs text-muted-foreground">{percentage.toFixed(0)}%</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default TimingWaterfall
