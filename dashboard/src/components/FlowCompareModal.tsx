import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, GitCompare, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from './ui/button'
import { DiffViewer, InlineDiff } from './DiffViewer'
import { compareFlows } from '@/lib/api'
import type { FlowSummary, FlowComparison } from '@/lib/types'

interface FlowCompareModalProps {
  flow1: FlowSummary | null
  flow2: FlowSummary | null
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string | null
  embedded?: boolean
}

export function FlowCompareModal({ flow1, flow2, open, onOpenChange, token, embedded = false }: FlowCompareModalProps) {
  const [comparison, setComparison] = useState<FlowComparison | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState({
    requestUrl: true,
    requestMethod: true,
    requestHeaders: false,
    requestBody: true,
    responseStatus: true,
    responseHeaders: false,
    responseBody: true,
  })

  useEffect(() => {
    if ((open || embedded) && flow1 && flow2) {
      loadComparison()
    }
  }, [open, embedded, flow1, flow2])

  const loadComparison = async () => {
    if (!flow1 || !flow2) return

    setLoading(true)
    setError(null)
    try {
      const result = await compareFlows(flow1.id, flow2.id, token)
      setComparison(result)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const hasDifferences = (obj: Record<string, { equal: boolean }>) => {
    return Object.values(obj).some(v => !v.equal)
  }

  if (!embedded && (!open || !flow1 || !flow2)) return null

  if (embedded && (!flow1 || !flow2)) {
    return (
      <div className="glass-panel flex min-h-[400px] items-center justify-center p-8 text-center">
        <div className="space-y-2">
          <GitCompare className="mx-auto h-8 w-8 text-muted-foreground" />
          <div className="text-sm font-medium text-foreground/90">Select two flows to compare</div>
          <div className="text-sm text-muted-foreground">Use the checkboxes in the flow list to pick exactly two flows.</div>
        </div>
      </div>
    )
  }

  const inner = (
    <>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-muted/30">
          <div className="flex items-center gap-3">
            <GitCompare className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold">Compare Flows</h2>
          </div>
          {!embedded ? (
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Close compare flows">
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="h-8 w-8 border-2 border-cyan-500 border-t-transparent rounded-full"
              />
            </div>
          )}

          {error && (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
              {error}
            </div>
          )}

          {!loading && !error && comparison && (
            <>
              {/* Flow IDs */}
              <div className="flex gap-4 text-sm">
                <div className="flex-1 p-3 rounded-lg bg-muted/30 border border-border/50">
                  <div className="text-xs text-muted-foreground mb-1">Flow 1</div>
                  <div className="font-mono text-cyan-400">{comparison.flow1_id}</div>
                </div>
                <div className="flex-1 p-3 rounded-lg bg-muted/30 border border-border/50">
                  <div className="text-xs text-muted-foreground mb-1">Flow 2</div>
                  <div className="font-mono text-emerald-400">{comparison.flow2_id}</div>
                </div>
              </div>

              {/* Request Section */}
              {comparison.request && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Request</h3>

                  {/* URL */}
                  <div className="rounded-lg border border-border/50 overflow-hidden">
                    <button
                      onClick={() => toggleSection('requestUrl')}
                      className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">URL</span>
                        {!comparison.request.url.equal && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">Different</span>
                        )}
                      </div>
                      {expandedSections.requestUrl ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <AnimatePresence>
                      {expandedSections.requestUrl && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: 'auto' }}
                          exit={{ height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="p-4">
                            {comparison.request.url.equal ? (
                              <span className="text-emerald-400">{comparison.request.url.value1}</span>
                            ) : (
                              <DiffViewer diff={comparison.request.url.diff || []} />
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Method */}
                  <div className="rounded-lg border border-border/50 overflow-hidden">
                    <button
                      onClick={() => toggleSection('requestMethod')}
                      className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Method</span>
                        {!comparison.request.method.equal && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">Different</span>
                        )}
                      </div>
                      {expandedSections.requestMethod ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <AnimatePresence>
                      {expandedSections.requestMethod && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: 'auto' }}
                          exit={{ height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="p-4">
                            <InlineDiff
                              value1={String(comparison.request.method.value1)}
                              value2={String(comparison.request.method.value2)}
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Headers */}
                  <div className="rounded-lg border border-border/50 overflow-hidden">
                    <button
                      onClick={() => toggleSection('requestHeaders')}
                      className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Headers</span>
                        {hasDifferences(comparison.request.headers) && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">Different</span>
                        )}
                      </div>
                      {expandedSections.requestHeaders ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <AnimatePresence>
                      {expandedSections.requestHeaders && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: 'auto' }}
                          exit={{ height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="p-4">
                            <table className="w-full text-sm">
                              <tbody>
                                {Object.entries(comparison.request.headers).map(([key, header]) => (
                                  <tr key={key} className={!header.equal ? 'bg-amber-500/5' : ''}>
                                    <td className="py-2 pr-4 text-muted-foreground">{key}</td>
                                    <td className="py-2">
                                      {!header.equal ? (
                                        <InlineDiff value1={header.value1 || '(missing)'} value2={header.value2 || '(missing)'} />
                                      ) : (
                                        <span className="text-emerald-400">{header.value1}</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Body */}
                  <div className="rounded-lg border border-border/50 overflow-hidden">
                    <button
                      onClick={() => toggleSection('requestBody')}
                      className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Body</span>
                        {!comparison.request.body.equal && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">Different</span>
                        )}
                      </div>
                      {expandedSections.requestBody ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <AnimatePresence>
                      {expandedSections.requestBody && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: 'auto' }}
                          exit={{ height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="p-4">
                            {comparison.request.body.equal ? (
                              <pre className="text-xs text-emerald-400 whitespace-pre-wrap">{comparison.request.body.value1}</pre>
                            ) : (
                              <DiffViewer diff={comparison.request.body.diff} />
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {/* Response Section */}
              {comparison.response && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Response</h3>

                  {/* Status */}
                  <div className="rounded-lg border border-border/50 overflow-hidden">
                    <button
                      onClick={() => toggleSection('responseStatus')}
                      className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Status</span>
                        {!comparison.response.status.equal && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">Different</span>
                        )}
                      </div>
                      {expandedSections.responseStatus ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <AnimatePresence>
                      {expandedSections.responseStatus && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: 'auto' }}
                          exit={{ height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="p-4">
                            <InlineDiff
                              value1={String(comparison.response.status.value1)}
                              value2={String(comparison.response.status.value2)}
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Response Headers */}
                  <div className="rounded-lg border border-border/50 overflow-hidden">
                    <button
                      onClick={() => toggleSection('responseHeaders')}
                      className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Headers</span>
                        {hasDifferences(comparison.response.headers) && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">Different</span>
                        )}
                      </div>
                      {expandedSections.responseHeaders ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <AnimatePresence>
                      {expandedSections.responseHeaders && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: 'auto' }}
                          exit={{ height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="p-4">
                            <table className="w-full text-sm">
                              <tbody>
                                {Object.entries(comparison.response.headers).map(([key, header]) => (
                                  <tr key={key} className={!header.equal ? 'bg-amber-500/5' : ''}>
                                    <td className="py-2 pr-4 text-muted-foreground">{key}</td>
                                    <td className="py-2">
                                      {!header.equal ? (
                                        <InlineDiff value1={header.value1 || '(missing)'} value2={header.value2 || '(missing)'} />
                                      ) : (
                                        <span className="text-emerald-400">{header.value1}</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Response Body */}
                  <div className="rounded-lg border border-border/50 overflow-hidden">
                    <button
                      onClick={() => toggleSection('responseBody')}
                      className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Body</span>
                        {!comparison.response.body.equal && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">Different</span>
                        )}
                      </div>
                      {expandedSections.responseBody ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <AnimatePresence>
                      {expandedSections.responseBody && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: 'auto' }}
                          exit={{ height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="p-4">
                            {comparison.response.body.equal ? (
                              <pre className="text-xs text-emerald-400 whitespace-pre-wrap">{comparison.response.body.value1}</pre>
                            ) : (
                              <DiffViewer diff={comparison.response.body.diff} />
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
    </>
  )

  if (embedded) {
    return <div className="glass-panel flex h-full min-h-[600px] flex-col overflow-hidden">{inner}</div>
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-5xl max-h-[90vh] bg-card border border-border rounded-lg shadow-2xl overflow-hidden flex flex-col"
      >
        {inner}
      </motion.div>
    </div>
  )
}
