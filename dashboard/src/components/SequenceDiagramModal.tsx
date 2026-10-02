import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Workflow, ChevronDown, ChevronUp } from '@/components/ui/icons'
import { Button } from './ui/button'
import { SequenceDiagram } from './SequenceDiagram'
import { getSequence } from '@/lib/api'
import type { FlowSummary, SequenceData } from '@/lib/types'

interface SequenceDiagramModalProps {
  flows: FlowSummary[]
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string | null
  embedded?: boolean
}

export function SequenceDiagramModal({ flows, open, onOpenChange, token, embedded = false }: SequenceDiagramModalProps) {
  const [selectedFlowIds, setSelectedFlowIds] = useState<string[]>([])
  const [sequenceData, setSequenceData] = useState<SequenceData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  // Group flows by host for easier selection
  const groupedFlows = flows.reduce((acc, flow) => {
    const host = flow.request?.host || flow.request?.url?.split('/')[2] || 'Unknown'
    if (!acc[host]) acc[host] = []
    acc[host].push(flow)
    return acc
  }, {} as Record<string, FlowSummary[]>)

  useEffect(() => {
    if ((open || embedded) && flows.length > 0) {
      // Auto-select all flows by default
      setSelectedFlowIds(flows.map(f => f.id))
    }
  }, [open, embedded, flows])

  useEffect(() => {
    const generateSequence = async () => {
      if (selectedFlowIds.length < 2) {
        setSequenceData(null)
        return
      }

      setLoading(true)
      setError(null)
      try {
        const result = await getSequence(selectedFlowIds, token)
        setSequenceData(result)
      } catch (err) {
        setError((err as Error).message)
        setSequenceData(null)
      } finally {
        setLoading(false)
      }
    }

    generateSequence()
  }, [selectedFlowIds, token])

  const toggleFlow = (flowId: string) => {
    setSelectedFlowIds(prev =>
      prev.includes(flowId)
        ? prev.filter(id => id !== flowId)
        : [...prev, flowId]
    )
  }

  const toggleHost = (_host: string, hostFlows: FlowSummary[]) => {
    const hostFlowIds = hostFlows.map(f => f.id)
    const allSelected = hostFlowIds.every(id => selectedFlowIds.includes(id))

    if (allSelected) {
      setSelectedFlowIds(prev => prev.filter(id => !hostFlowIds.includes(id)))
    } else {
      setSelectedFlowIds(prev => [...new Set([...prev, ...hostFlowIds])])
    }
  }

  const toggleGroup = (host: string) => {
    setExpandedGroups(prev => ({ ...prev, [host]: !prev[host] }))
  }

  const selectAll = () => {
    setSelectedFlowIds(flows.map(f => f.id))
  }

  const clearAll = () => {
    setSelectedFlowIds([])
  }

  if (!open && !embedded) return null

  const inner = (
    <>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-muted/30">
          <div className="flex items-center gap-3">
            <Workflow className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold">Sequence Diagram</h2>
            <span className="text-sm text-muted-foreground">
              ({selectedFlowIds.length} flows selected)
            </span>
          </div>
          {!embedded ? (
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Close sequence diagram">
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar - Flow Selection */}
          <div className="w-80 border-r border-border/50 bg-muted/10 flex flex-col">
            <div className="p-4 border-b border-border/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Select Flows</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAll} className="flex-1">
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={clearAll} className="flex-1">
                  Clear
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-2 space-y-2">
              {Object.entries(groupedFlows).map(([host, hostFlows]) => {
                const hostFlowIds = hostFlows.map(f => f.id)
                const selectedCount = hostFlowIds.filter(id => selectedFlowIds.includes(id)).length
                const allSelected = selectedCount === hostFlows.length
                const someSelected = selectedCount > 0 && !allSelected
                const isExpanded = expandedGroups[host] !== false // Default to expanded

                return (
                  <div key={host} className="border border-border/50 rounded-lg overflow-hidden">
                    <div className="flex items-center gap-2 bg-muted/30 px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Select all flows for ${host}`}
                        className="rounded border-border/50"
                        checked={allSelected}
                        ref={el => {
                          if (el) el.indeterminate = someSelected
                        }}
                        onChange={() => toggleHost(host, hostFlows)}
                      />
                      <button
                        type="button"
                        onClick={() => toggleGroup(host)}
                        aria-expanded={isExpanded}
                        className="flex min-w-0 flex-1 items-center justify-between rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span className="truncate text-sm font-medium" title={host}>
                            {host}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ({selectedCount}/{hostFlows.length})
                          </span>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: 'auto' }}
                          exit={{ height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="p-2 space-y-1">
                            {hostFlows.map(flow => (
                              <label
                                key={flow.id}
                                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/30 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  className="rounded border-border/50"
                                  checked={selectedFlowIds.includes(flow.id)}
                                  onChange={() => toggleFlow(flow.id)}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-medium">
                                    {flow.request?.method} {flow.request?.path}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {flow.response?.status_code} - {new Date(flow.ts * 1000).toLocaleTimeString()}
                                  </div>
                                </div>
                              </label>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              })}

              {flows.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No flows available
                </div>
              )}
            </div>
          </div>

          {/* Main - Diagram */}
          <div className="flex-1 flex flex-col min-w-0">
            {selectedFlowIds.length < 2 ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Workflow className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Select at least 2 flows to generate a sequence diagram</p>
                </div>
              </div>
            ) : loading ? (
              <div className="flex-1 flex items-center justify-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="h-8 w-8 border-2 border-cyan-500 border-t-transparent rounded-full"
                />
              </div>
            ) : error ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 max-w-md">
                  {error}
                </div>
              </div>
            ) : sequenceData ? (
              <SequenceDiagram sequenceData={sequenceData} />
            ) : null}
          </div>
        </div>
    </>
  )

  if (embedded) {
    return <div className="glass-panel flex h-full min-h-[600px] flex-col overflow-hidden">{inner}</div>
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-7xl max-h-[95vh] bg-card border border-border rounded-lg shadow-2xl overflow-hidden flex flex-col"
      >
        {inner}
      </motion.div>
    </div>
  )
}
