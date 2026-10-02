import {
  Activity,
  Bot,
  Bug,
  Cable,
  GitCompare,
  Replay,
  Search,
  Settings,
  Terminal,
  Workflow,
} from '@/components/ui/icons'
import type { ComponentType, SVGProps } from 'react'

import { BrandMark } from './BrandMark'
import { FlowsIcon } from './FlowsIcon'
import type { DashboardView } from '@/lib/types'

type NavItem = {
  view: DashboardView
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  beta?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { view: 'capture', label: 'Capture', icon: Activity },
  { view: 'flows', label: 'Flows', icon: FlowsIcon },
  { view: 'search', label: 'Search', icon: Search },
  { view: 'compare', label: 'Compare', icon: GitCompare },
  { view: 'sequence', label: 'Sequence', icon: Workflow },
  { view: 'replay', label: 'Replay', icon: Replay },
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
    <nav aria-label="Primary navigation" className="nav-rail flex h-full w-[60px] shrink-0 flex-col border-r border-white/[0.07] sm:w-[72px] lg:w-[208px]">
      <div className="brand-lockup flex h-[76px] shrink-0 items-center justify-center gap-2.5 px-2 lg:justify-start lg:px-4">
        <div className="brand-emblem flex h-11 w-11 shrink-0 items-center justify-center">
          <BrandMark className="h-11 w-11" />
        </div>
        <div className="hidden min-w-0 lg:block">
          <div className="text-[14px] font-semibold leading-tight tracking-[-0.035em] text-foreground">backchannel<span className="brand-wordmark-dot text-accent">.</span></div>
          <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.14em] text-muted-foreground">Traffic inspector</div>
        </div>
      </div>

      <div className="px-2 pb-5 lg:px-3">
        <button
          type="button"
          onClick={onOpenConnections}
          className="group flex w-full items-center justify-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.025] px-3 py-2.5 text-xs font-medium text-foreground/85 shadow-[var(--glass-highlight)] transition-colors hover:border-accent/30 hover:bg-accent/[0.06] hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:justify-start"
          aria-label="Connect a traffic source"
          title="Connect a traffic source"
        >
          <Cable className="h-4 w-4 shrink-0" />
          <span className="hidden lg:inline">Connect source</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 lg:px-3">
        {NAV_ITEMS.map((item) => {
          const active = view === item.view
          const Icon = item.icon
          return (
            <div key={item.view}>
              {item.view === 'capture' || item.view === 'compare' || item.view === 'agents' ? (
                <div className={`terminal-label hidden px-3 pb-2 text-[8px] text-muted-foreground/60 lg:block ${item.view === 'capture' ? '' : 'pt-6'}`}>
                  {item.view === 'capture' ? 'Workspace' : item.view === 'compare' ? 'Investigate' : 'Toolkit'}
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => onViewChange(item.view)}
                aria-label={item.label}
                title={item.label}
                aria-current={active ? 'page' : undefined}
                className={`nav-item group mb-1 flex w-full items-center justify-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:justify-start ${
                  active
                    ? 'text-accent'
                    : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground/90'
                }`}
              >
                <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-accent' : ''}`} />
                <span className="hidden truncate lg:inline">{item.label}</span>
                {active ? <span className="ml-auto hidden h-1 w-1 rounded-full bg-accent shadow-[0_0_8px_hsl(var(--accent)/0.6)] lg:block" /> : item.beta ? (
                  <span className="ml-auto hidden rounded border border-hairline px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-muted-foreground lg:inline">
                    Beta
                  </span>
                ) : null}
              </button>
            </div>
          )
        })}
      </div>

      <div className="mx-2 mb-4 mt-3 rounded-xl border border-white/[0.07] bg-black/15 px-2 py-3 lg:mx-3 lg:px-3">
        <div className="flex items-center justify-center gap-2 lg:justify-start">
          <span
            className={`h-1.5 w-1.5 rounded-full ${liveActive ? 'bg-accent shadow-[0_0_8px_hsl(var(--accent)/0.9)]' : 'bg-muted-foreground/50'}`}
            title={liveLabel}
          />
          <span className="hidden font-mono text-[10px] text-foreground/80 lg:inline">{running ? 'CAPTURE ACTIVE' : 'CAPTURE STANDBY'}</span>
        </div>
        <div className="mt-2 hidden items-center gap-2 font-mono text-[9px] text-muted-foreground lg:flex"><Terminal className="h-3 w-3" /><span className="truncate">{listenHost ? `${listenHost}:${listenPort ?? 8080}` : '127.0.0.1:8080'}</span></div>
      </div>
    </nav>
  )
}
