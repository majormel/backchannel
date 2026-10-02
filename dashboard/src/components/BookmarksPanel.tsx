import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Star, X, ExternalLink, Trash2 } from '@/components/ui/icons'
import { Button } from './ui/button'
import type { FlowSummary } from '@/lib/types'
import { getMethodColor, getStatusBadgeColor, truncateUrl } from '@/lib/flowDisplay'

type BookmarksPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookmarkedFlowIds: string[]
  flows: FlowSummary[]
  onSelectFlow: (flow: FlowSummary) => void
  onToggleBookmark: (flowId: string) => void
  onClearAll: () => void
}

export function BookmarksPanel({
  open,
  onOpenChange,
  bookmarkedFlowIds,
  flows,
  onSelectFlow,
  onToggleBookmark,
  onClearAll,
}: BookmarksPanelProps) {
  const bookmarkedFlows = useMemo(() => {
    const flowMap = new Map(flows.map(f => [f.id, f]))
    return bookmarkedFlowIds
      .map(id => flowMap.get(id))
      .filter((f): f is FlowSummary => f !== undefined)
  }, [bookmarkedFlowIds, flows])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={() => onOpenChange(false)}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-background border-l border-border/50 shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-border/50 bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Bookmarks</h2>
                  <p className="text-xs text-muted-foreground">
                    {bookmarkedFlowIds.length} saved flow{bookmarkedFlowIds.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {bookmarkedFlowIds.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClearAll}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Clear
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onOpenChange(false)}
                  className="h-8 w-8"
                  aria-label="Close bookmarks panel"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
              {bookmarkedFlows.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
                    <Star className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground font-medium">No bookmarks yet</p>
                    <p className="text-xs text-muted-foreground/70 max-w-[200px]">
                      Press <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs">b</kbd> on any flow to bookmark it
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {bookmarkedFlows.map((flow, index) => (
                    <motion.div
                      key={flow.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Inspect ${flow.request?.method || 'request'} ${flow.request?.url || ''}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="group relative cursor-pointer rounded-lg border border-border/50 bg-card/50 p-3 transition-[background-color,border-color] hover:border-amber-500/30 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => {
                        onSelectFlow(flow)
                        onOpenChange(false)
                      }}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
                        event.preventDefault()
                        onSelectFlow(flow)
                        onOpenChange(false)
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          aria-label="Remove bookmark"
                          onClick={(e) => {
                            e.stopPropagation()
                            onToggleBookmark(flow.id)
                          }}
                          className="mt-0.5 flex-shrink-0 p-1 rounded-md hover:bg-amber-500/10 transition-colors"
                        >
                          <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                        </button>

                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${getMethodColor(flow.request?.method || '')}`}>
                              {flow.request?.method || '-'}
                            </span>
                            {flow.response?.status_code ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${getStatusBadgeColor(flow.response.status_code)}`}>
                                {flow.response.status_code}
                              </span>
                            ) : null}
                            <span className="text-xs text-muted-foreground">
                              {new Date(flow.ts * 1000).toLocaleTimeString()}
                            </span>
                          </div>

                          <p className="text-sm text-foreground/80 font-medium truncate" title={flow.request?.url || ''}>
                            {truncateUrl(flow.request?.url || '', 50)}
                          </p>
                        </div>

                        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ExternalLink className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-border/50 bg-muted/30 text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Press <kbd className="px-1.5 py-0.5 rounded bg-muted">B</kbd> to toggle this panel</span>
                <span><kbd className="px-1.5 py-0.5 rounded bg-muted">b</kbd> to bookmark selected flow</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
