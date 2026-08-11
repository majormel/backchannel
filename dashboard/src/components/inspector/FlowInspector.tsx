import { useId, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Check, Copy, Play, ServerCrash, Sparkles } from 'lucide-react'

import BodyViewer from '../BodyViewer'
import JsonHighlighter from '../JsonHighlighter'
import { FlowTimingDetail } from '../TimingWaterfall'
import { HeaderTable } from './HeaderTable'
import { OverviewTab } from './OverviewTab'
import { Button } from '../ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { flowToCurl } from '@/lib/curl'
import { getMethodColor, getStatusBadgeColor, getUrlDisplayParts, truncatePath } from '@/lib/flowDisplay'
import { HighlightedText } from '../HighlightedText'
import type { Flow } from '@/lib/types'

type FlowInspectorProps = {
  flow: Flow | null
  loading?: boolean
  onReplayRequest: (flow: Flow) => void
  className?: string
  highlightQuery?: string
}

const INSPECTOR_TABS = ['overview', 'request', 'response', 'headers', 'json', 'timing'] as const
type InspectorTab = (typeof INSPECTOR_TABS)[number]

function InspectorShell({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <div className="glass-panel flex h-full min-h-[420px] items-center justify-center p-8 text-center">
        {children}
      </div>
    </div>
  )
}

export function FlowInspector({ flow, loading = false, onReplayRequest, className, highlightQuery = '' }: FlowInspectorProps) {
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<InspectorTab>('overview')
  const tabsId = useId()
  const reduceMotion = useReducedMotion()

  const handleCopyCurl = async () => {
    if (!flow) return
    try {
      await navigator.clipboard.writeText(flowToCurl(flow))
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  if (loading && !flow) {
    return (
      <InspectorShell className={className}>
        <div className="space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-hairline bg-surface-1">
            <Sparkles className="h-5 w-5 text-accent" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground/90">Loading flow details</p>
            <p className="mt-1 text-sm text-muted-foreground">Pulling the full request and response for inspection.</p>
          </div>
        </div>
      </InspectorShell>
    )
  }

  if (!flow) {
    return (
      <InspectorShell className={className}>
        <div className="space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-hairline bg-surface-1">
            <ServerCrash className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground/90">Select a flow to inspect</p>
            <p className="mt-1 text-sm text-muted-foreground">Request and response detail opens here.</p>
          </div>
        </div>
      </InspectorShell>
    )
  }

  const target = getUrlDisplayParts(flow.request?.url || '', flow.request?.host, flow.request?.path)
  const responseContent = flow.response?.body ?? ''

  return (
    <div className={className}>
      <div className="glass-panel flex h-full flex-col overflow-hidden">
        <div className="border-b border-hairline px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[11px] font-semibold ${getMethodColor(flow.request?.method || '')}`}>
                  {flow.request?.method || '-'}
                </span>
                {flow.response?.status_code ? (
                  <span className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[11px] font-semibold ${getStatusBadgeColor(flow.response.status_code)}`}>
                    {flow.response.status_code}
                  </span>
                ) : null}
                <span className="truncate font-mono text-sm text-foreground/90" title={flow.request?.url || ''}>
                  <HighlightedText text={truncatePath(target.path || '/', 72)} query={highlightQuery} />
                </span>
              </div>
              <div className="truncate text-xs text-muted-foreground">{target.host}</div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" onClick={() => onReplayRequest(flow)}>
                <Play className="mr-1.5 h-3.5 w-3.5" />
                Replay
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyCurl}
                className={copied ? 'border-accent/50 bg-accent/12 text-accent' : ''}
              >
                {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'cURL'}
              </Button>
            </div>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(value) => setTab(value as InspectorTab)} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="w-full overflow-x-auto px-3">
            {INSPECTOR_TABS.map((name) => (
              <TabsTrigger key={name} value={name} className="isolate border-transparent data-[state=active]:border-transparent">
                {tab === name ? (
                  <motion.span
                    layoutId={`${tabsId}-active-tab`}
                    className="absolute inset-x-1 bottom-0 z-0 h-0.5 rounded-pill bg-accent"
                    transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 460, damping: 38 }}
                  />
                ) : null}
                <span className="relative z-10">{name}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
            <TabsContent value="overview">
              <OverviewTab flow={flow} />
            </TabsContent>
            <TabsContent value="request">
              <BodyViewer
                resetKey={`${flow.id}:request`}
                title="Request body"
                headers={flow.request?.headers}
                body={flow.request?.body}
                body_base64={flow.request?.body_base64}
                body_proto={flow.request?.body_proto}
                highlightQuery={highlightQuery}
              />
            </TabsContent>
            <TabsContent value="response">
              <BodyViewer
                resetKey={`${flow.id}:response`}
                title="Response body"
                headers={flow.response?.headers}
                body={flow.response?.body}
                body_base64={flow.response?.body_base64}
                body_proto={flow.response?.body_proto}
                highlightQuery={highlightQuery}
              />
            </TabsContent>
            <TabsContent value="headers">
              <div className="space-y-5">
                <HeaderTable title="Request headers" headers={flow.request?.headers} highlightQuery={highlightQuery} />
                <HeaderTable title="Response headers" headers={flow.response?.headers} highlightQuery={highlightQuery} />
              </div>
            </TabsContent>
            <TabsContent value="json">
              {responseContent ? (
                <div className="glass-inset overflow-auto p-4 text-xs">
                  <JsonHighlighter content={responseContent} highlightQuery={highlightQuery} />
                </div>
              ) : (
                <div className="glass-inset px-4 py-3 text-xs text-muted-foreground">No response body to render as JSON.</div>
              )}
            </TabsContent>
            <TabsContent value="timing">
              <FlowTimingDetail flow={flow} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )
}
