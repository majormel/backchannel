import { getUrlDisplayParts, parseClient } from '@/lib/flowDisplay'
import type { Flow } from '@/lib/types'

type OverviewTabProps = {
  flow: Flow
}

function Row({ label, value, muted }: { label: string; value: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 py-1.5">
      <div className="w-28 shrink-0 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className={`min-w-0 break-all font-mono text-xs ${muted ? 'text-muted-foreground/70' : 'text-foreground/90'}`}>
        {value}
      </div>
    </div>
  )
}

export function OverviewTab({ flow }: OverviewTabProps) {
  const target = getUrlDisplayParts(flow.request?.url || '', flow.request?.host, flow.request?.path)
  const userAgent = flow.request?.headers?.['User-Agent'] || flow.request?.headers?.['user-agent'] || null
  const client = parseClient(userAgent)
  const requestVersion = flow.request?.http_version || null
  const notCaptured = <span className="italic text-muted-foreground/60">not captured yet</span>

  return (
    <div className="space-y-5">
      <div className="glass-inset px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Flow Overview</div>
        <div className="mt-2">
          <Row label="ID" value={flow.id} />
          <Row label="Timestamp" value={new Date(flow.ts * 1000).toLocaleString()} />
          <Row label="Host" value={target.host} />
          <Row label="Status" value={`${flow.response?.status_code ?? '-'} ${flow.response?.reason || ''}`} />
          <Row label="Client" value={client ? `${client}` : (userAgent ? 'Unknown' : notCaptured)} />
          <Row label="Client addr" value={flow.client ? `${flow.client[0]}:${flow.client[1]}` : '-'} />
          <Row label="Server addr" value={flow.server ? `${flow.server[0]}:${flow.server[1]}` : '-'} />
        </div>
      </div>

      <div className="glass-inset px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Protocol</div>
        <div className="mt-2">
          <Row label="HTTP" value={requestVersion || notCaptured} />
          <Row label="TLS" value={notCaptured} muted />
          <Row label="ALPN" value={notCaptured} muted />
        </div>
      </div>
    </div>
  )
}
