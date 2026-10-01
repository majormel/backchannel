import { ArrowUpRight, Cable } from '@/components/ui/icons'
import type { DashboardView } from '@/lib/types'
import { Button } from '../ui/button'

const VIEW_COPY: Record<DashboardView, { title: string; detail: string }> = {
  capture: { title: 'See the signal.', detail: 'A live window into the traffic behind your apps.' },
  flows: { title: 'Follow every request.', detail: 'Explore, bookmark, and inspect your captured exchanges.' },
  search: { title: 'Find the needle.', detail: 'Trace a request with precise filters and saved views.' },
  compare: { title: 'Spot the difference.', detail: 'Select two flows to see what changed between exchanges.' },
  sequence: { title: 'Connect the dots.', detail: 'See the conversation between your clients and services.' },
  replay: { title: 'Run it again.', detail: 'Fine-tune a captured request and inspect the result.' },
  agents: { title: 'A second set of eyes.', detail: 'Bring a selected exchange into a read-only Codex review.' },
  frida: { title: 'Look beneath the surface.', detail: 'Instrument processes and correlate events with traffic.' },
  settings: { title: 'Make it your own.', detail: 'Configure your proxy, capture settings, and connections.' },
}

export function WorkspaceHeading({ view, running, onConnect }: { view: DashboardView; running: boolean; onConnect: () => void }) {
  const copy = VIEW_COPY[view]
  return (
    <div className="workspace-heading flex shrink-0 flex-wrap items-end justify-between gap-4 px-5 pb-5 pt-7 sm:px-6">
      <div className="min-w-0">
        <div className="terminal-label mb-3 flex items-center gap-2 text-accent">
          <span className="text-accent/50">~/</span>{view}
          <span className="terminal-cursor" aria-hidden="true" />
        </div>
        <h1 className="text-[28px] font-medium leading-tight tracking-[-0.045em] sm:text-[34px]">{copy.title}</h1>
        <p className="mt-2 text-xs leading-5 text-muted-foreground sm:text-[13px]">{copy.detail}</p>
      </div>
      {view === 'capture' || view === 'flows' ? (
        <Button variant="outline" size="sm" onClick={onConnect} className="h-9 gap-2 rounded-pill px-3.5">
          <Cable className="h-3.5 w-3.5 text-accent" />Connect source<ArrowUpRight className="h-3 w-3 text-muted-foreground" />
        </Button>
      ) : (
        <span className="status-pill font-mono text-[10px]">{running ? 'proxy: running' : 'proxy: stopped'}</span>
      )}
    </div>
  )
}
