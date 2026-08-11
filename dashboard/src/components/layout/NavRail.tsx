import {
  Activity,
  Bot,
  Bug,
  Cable,
  GitCompare,
  ListTree,
  Play,
  Search,
  Settings,
  Workflow,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { BrandMark } from './BrandMark'
import type { DashboardView } from '@/lib/types'

type NavItem = {
  view: DashboardView
  label: string
  icon: LucideIcon
  beta?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { view: 'capture', label: 'Capture', icon: Activity },
  { view: 'flows', label: 'Flows', icon: ListTree },
  { view: 'search', label: 'Search', icon: Search },
  { view: 'compare', label: 'Compare', icon: GitCompare },
  { view: 'sequence', label: 'Sequence', icon: Workflow },
  { view: 'replay', label: 'Replay', icon: Play },
  { view: 'agents', label: 'Agents', icon: Bot, beta: true },
  { view: 'frida', label: 'Frida', icon: Bug },
  { view: 'settings', label: 'Settings', icon: Settings },
]

type NavRailProps = {
  view: DashboardView
  onViewChange: (view: DashboardView) => void
  running: boolean
  listenHost?: string | null
  listenPort?: number | null
  liveLabel: string
  liveActive: boolean
  onOpenConnections: () => void
}

export function NavRail({ view, onViewChange, running, listenHost, listenPort, liveLabel, liveActive, onOpenConnections }: NavRailProps) {
  return (
    <nav aria-label="Primary navigation" className="glass-bar flex h-full w-[60px] shrink-0 flex-col border-r border-white/[0.07] sm:w-[76px] lg:w-[210px]">
      <div className="flex items-center justify-center gap-2.5 px-3 py-4 lg:justify-start lg:px-4">
        <BrandMark className="h-8 w-8 drop-shadow-[0_2px_12px_hsl(219_89%_60%/0.35)]" />
        <div className="hidden min-w-0 lg:block">
          <div className="text-[15px] font-semibold leading-tight tracking-tight text-foreground">Backchannel</div>
        </div>
      </div>

      <div className="px-2 pb-2">
        <button
          type="button"
          onClick={onOpenConnections}
          className="group flex w-full items-center justify-center gap-2.5 rounded-xl border border-accent/20 bg-accent/[0.07] px-3 py-2.5 text-xs font-semibold text-accent shadow-[inset_0_1px_0_hsl(var(--accent)/0.08)] transition-[transform,background-color,border-color] hover:-translate-y-px hover:border-accent/35 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none lg:justify-start"
          aria-label="Connect a traffic source"
          title="Connect a traffic source"
        >
          <Cable className="h-4 w-4 shrink-0" />
          <span className="hidden lg:inline">Connect source</span>
        </button>
      </div>

      <div className="flex-1 space-y-0.5 px-2 py-2">
        {NAV_ITEMS.map((item) => {
          const active = view === item.view
          const Icon = item.icon
          return (
            <button
              key={item.view}
              type="button"
              onClick={() => onViewChange(item.view)}
              aria-label={item.label}
              title={item.label}
              aria-current={active ? 'page' : undefined}
              className={`group flex w-full items-center justify-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:justify-start ${
                active
                  ? 'bg-white/[0.06] text-foreground shadow-[inset_2px_0_0_hsl(var(--accent)),inset_0_1px_0_hsl(0_0%_100%/0.05)]'
                  : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground/90'
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-accent' : ''}`} />
              <span className="hidden truncate lg:inline">{item.label}</span>
              {item.beta ? (
                <span className="ml-auto hidden rounded border border-hairline px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-muted-foreground lg:inline">
                  Beta
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="mx-2 mb-1 border-t border-white/[0.06] px-2 pb-2 pt-3 lg:px-3">
        <div className="flex items-center justify-center gap-2 lg:justify-start">
          <span
            className={`h-1.5 w-1.5 rounded-full ${liveActive ? 'bg-accent shadow-[0_0_8px_hsl(var(--accent)/0.9)]' : 'bg-muted-foreground/50'}`}
            title={liveLabel}
          />
          <span className="hidden text-xs font-medium text-foreground/90 lg:inline">{running ? 'Live' : 'Stopped'}</span>
          <span className="hidden truncate font-mono text-[11px] text-muted-foreground lg:ml-auto lg:inline">
            {running && listenHost ? `${listenHost}:${listenPort ?? ''}` : 'offline'}
          </span>
        </div>
      </div>
    </nav>
  )
}
