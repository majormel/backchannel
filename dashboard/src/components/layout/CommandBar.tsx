import { useEffect, useState } from 'react'
import { ArrowRight, ChevronRight, Copy, Play, Replay, Search, Square, Upload } from '@/components/ui/icons'

import { Button } from '../ui/button'
import type { MitmStatus } from '@/lib/types'

type CommandBarProps = {
  status: MitmStatus
  liveLabel: string
  liveActive: boolean
  searchValue: string
  searchVisible?: boolean
  onSearchSubmit: (value: string) => void
  onStart: () => void
  onStop: () => void
  onOpenReplay: () => void
  onOpenExport: () => void
  exportCount: number
  onCopyToken: () => void
  tokenReady: boolean
  workspaceName?: string
}

export function CommandBar({
  status,
  liveLabel,
  liveActive,
  searchValue,
  searchVisible = true,
  onSearchSubmit,
  onStart,
  onStop,
  onOpenReplay,
  onOpenExport,
  exportCount,
  onCopyToken,
  tokenReady,
  workspaceName = 'Capture',
}: CommandBarProps) {
  const [draft, setDraft] = useState(searchValue)

  useEffect(() => {
    setDraft(searchValue)
  }, [searchValue])

  return (
    <header className="command-bar flex h-[76px] shrink-0 items-center gap-2 border-b border-white/[0.07] px-3 sm:gap-4 sm:px-6">
      <div className="hidden shrink-0 items-center gap-2 text-[11px] lg:flex">
        <span className="text-muted-foreground">Workspace</span><ChevronRight className="h-3 w-3 text-muted-foreground/50" /><span className="text-foreground/90">{workspaceName}</span>
      </div>
      {searchVisible ? (
        <form
          className="relative ml-auto min-w-0 max-w-[360px] flex-1"
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            onSearchSubmit(draft)
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            name="flow-search"
            aria-label="Quick search captured flows"
            autoComplete="off"
            spellCheck={false}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Quick search flows…"
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.025] pl-9 pr-10 text-xs text-foreground placeholder:text-muted-foreground/75 focus-visible:border-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Open advanced search"
            title="Open advanced search"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </form>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2 px-1" aria-label="Advanced flow search workspace">
          <Search className="h-4 w-4 shrink-0 text-accent" />
          <span className="truncate text-sm font-medium text-foreground/90">Advanced search</span>
          <span className="hidden truncate text-xs text-muted-foreground md:inline">Presets, saved views, and filters</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <div
          className={`hidden items-center gap-1.5 px-1 font-mono text-xs lg:inline-flex ${status.running ? 'text-accent' : 'text-muted-foreground'}`}
          title={liveLabel}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              status.running && liveActive
                ? 'bg-accent shadow-[0_0_8px_hsl(var(--accent)/0.9)]'
                : status.running
                  ? 'bg-warning'
                  : 'bg-muted-foreground/60'
            }`}
          />
          {status.running ? `LIVE · ${status.listen_host ?? ''}:${status.listen_port ?? ''}` : 'OFFLINE'}
        </div>

        {status.running ? (
          <Button variant="outline" size="sm" onClick={onStop} aria-label="Stop proxy">
            <Square className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Stop</span>
          </Button>
        ) : (
          <Button size="sm" onClick={onStart} aria-label="Start proxy" className="rounded-pill px-3.5">
            <Play className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Start capture</span>
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onOpenReplay} className="hidden xl:inline-flex">
          <Replay className="mr-1.5 h-3.5 w-3.5" />
          Replay
        </Button>
        <Button variant="ghost" size="sm" onClick={onOpenExport} disabled={exportCount === 0} className="hidden xl:inline-flex">
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          Export{exportCount > 0 ? ` (${exportCount})` : ''}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onCopyToken}
          className="hidden h-9 w-9 sm:inline-flex"
          aria-label="Copy dashboard token"
          title={tokenReady ? 'Copy token' : 'Token required'}
        >
          <Copy className={`h-3.5 w-3.5 ${tokenReady ? '' : 'text-warning'}`} />
        </Button>
      </div>
    </header>
  )
}
