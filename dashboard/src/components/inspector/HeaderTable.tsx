import { useMemo } from 'react'
import { HighlightedText } from '../HighlightedText'

type HeaderTableProps = {
  title: string
  headers?: Record<string, string> | null
  highlightQuery?: string
}

export function HeaderTable({ title, headers, highlightQuery = '' }: HeaderTableProps) {
  const entries = useMemo(() => Object.entries(headers || {}), [headers])

  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</div>
      {entries.length === 0 ? (
        <div className="glass-inset px-3 py-2 text-xs text-muted-foreground">No headers</div>
      ) : (
        <div className="glass-inset divide-y divide-hairline/60 overflow-hidden font-mono text-xs">
          {entries.map(([key, value]) => (
            <div key={`${key}-${value}`} className="flex gap-3 px-3 py-1.5">
              <div className="w-2/5 shrink-0 break-all text-accent/90">
                <HighlightedText text={key} query={highlightQuery} />
              </div>
              <div className="w-3/5 break-all text-foreground/80">
                <HighlightedText text={value} query={highlightQuery} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
