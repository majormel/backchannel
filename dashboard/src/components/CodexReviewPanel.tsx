import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bot, Check, FileSearch, ShieldCheck, Sparkles, Square } from '@/components/ui/icons'
import { ThinkingOrb } from 'thinking-orbs'

import { getCodexReview, getCodexStatus, interruptCodexReview, startCodexReview } from '@/lib/api'
import { codexOrbState } from '@/lib/codexActivity'
import type { CodexReview, CodexStatus, Flow } from '@/lib/types'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Label } from './ui/label'
import { Switch } from './ui/switch'
import { Textarea } from './ui/textarea'

type CodexReviewPanelProps = {
  token: string | null
  flow: Flow | null
}

const reviewPrompts = [
  'Explain this request flow and flag anything unexpected.',
  'Look for authentication, session, and data exposure risks.',
  'Suggest the next three debugging checks from this evidence.',
]

function reviewStatusLabel(review: CodexReview | null, starting: boolean) {
  if (starting) return 'Connecting'
  if (!review) return 'Ready'
  if (review.status === 'starting' || review.status === 'running') return 'Thinking'
  if (review.status === 'completed') return 'Complete'
  if (review.status === 'interrupted') return 'Stopped'
  return 'Failed'
}

export function CodexReviewPanel({ token, flow }: CodexReviewPanelProps) {
  const [status, setStatus] = useState<CodexStatus | null>(null)
  const [review, setReview] = useState<CodexReview | null>(null)
  const [instruction, setInstruction] = useState(reviewPrompts[0])
  const [includeBodies, setIncludeBodies] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const reviewWorking = review?.status === 'starting' || review?.status === 'running'
  const isWorking = starting || reviewWorking
  const orbState = codexOrbState(starting, review)

  useEffect(() => {
    void getCodexStatus(token)
      .then(setStatus)
      .catch((nextError) => setError(nextError instanceof Error ? nextError.message : 'Could not reach Codex.'))
  }, [token])

  useEffect(() => {
    if (!review?.id || !reviewWorking) {
      return
    }
    const refresh = async () => {
      try {
        setReview(await getCodexReview(review.id, token))
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Could not refresh the Codex review.')
      }
    }
    const interval = window.setInterval(() => void refresh(), 800)
    return () => window.clearInterval(interval)
  }, [reviewWorking, review?.id, token])

  const handleStart = async () => {
    if (!flow) return
    setStarting(true)
    setError('')
    setReview(null)
    try {
      const next = await startCodexReview([flow.id], instruction, includeBodies, token)
      setReview(next)
      setStatus((current) => current ? { ...current, running: true, initialized: true } : current)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not start the Codex review.')
    } finally {
      setStarting(false)
    }
  }

  const handleInterrupt = async () => {
    if (!review) return
    try {
      setReview(await interruptCodexReview(review.id, token))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not stop the Codex review.')
    }
  }

  return (
    <Card className="glass-panel overflow-hidden">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="codex-orb-shell flex h-11 w-11 shrink-0 items-center justify-center">
              {isWorking ? <ThinkingOrb state={orbState} size={20} theme="dark" aria-label="Codex is reviewing" /> : <Bot className="h-4 w-4 text-accent" />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold text-foreground">Codex flow review</div>
                <span className="status-pill py-0.5 text-[10px]">
                  <ShieldCheck className="h-3 w-3" />
                  Read-only
                </span>
                <span className={`rounded-pill px-2.5 py-1 text-[10px] font-semibold ${
                  isWorking
                    ? 'bg-violet-400/12 text-violet-600 dark:text-violet-200'
                    : review?.status === 'completed'
                      ? 'bg-emerald-400/12 text-emerald-600 dark:text-emerald-200'
                      : 'bg-[hsl(var(--foreground)/0.06)] text-muted-foreground'
                }`}>
                  {reviewStatusLabel(review, starting)}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Review one captured exchange with the local Codex App Server bridge.
              </p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            {status?.available ? (status.initialized ? 'App Server connected' : 'Codex CLI ready') : 'Codex CLI unavailable'}
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-4">
            <div className="glass-soft p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <FileSearch className="h-3.5 w-3.5" />
                Review target
              </div>
              {flow ? (
                <div className="mt-3 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-pill bg-accent/12 px-2.5 py-1 text-[11px] font-semibold text-accent">{flow.request?.method || '-'}</span>
                    <span className="text-xs text-muted-foreground">{flow.response?.status_code || 'No response'}</span>
                  </div>
                  <div className="mt-2 truncate text-sm font-medium text-foreground" title={flow.request?.url || ''}>{flow.request?.url || 'Unknown URL'}</div>
                </div>
              ) : (
                <div className="mt-3 text-sm leading-6 text-muted-foreground">Select a flow in the traffic workspace to make it available for review.</div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="codex-instruction">What should Codex review?</Label>
              <Textarea
                id="codex-instruction"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                className="min-h-[104px]"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {reviewPrompts.map((prompt, index) => (
                <button
                  type="button"
                  key={prompt}
                  onClick={() => setInstruction(prompt)}
                  className="chip px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {index === 0 ? 'Explain' : index === 1 ? 'Security' : 'Next checks'}
                </button>
              ))}
            </div>

            <div className="glass-soft flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <div className="text-sm font-medium text-foreground">Include bodies</div>
                <div className="mt-0.5 text-xs text-muted-foreground">Headers are always redacted; bodies may contain sensitive data.</div>
              </div>
              <Switch checked={includeBodies} onCheckedChange={setIncludeBodies} aria-label="Include request and response bodies" />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void handleStart()} disabled={!flow || !instruction.trim() || starting || isWorking || status?.available === false}>
                <Sparkles className="mr-2 h-4 w-4" />
                {starting ? 'Starting review…' : 'Review selected flow'}
              </Button>
              {isWorking ? (
                <Button variant="outline" onClick={() => void handleInterrupt()}>
                  <Square className="mr-2 h-4 w-4" />
                  Stop
                </Button>
              ) : null}
            </div>
          </div>

          <div className="glass-inset min-h-[320px] overflow-hidden p-5">
            <AnimatePresence mode="wait">
              {review?.output ? (
                <motion.div key="output" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {review.status === 'completed' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Sparkles className="h-3.5 w-3.5 text-violet-400" />}
                    Review
                  </div>
                  <div className="whitespace-pre-wrap text-sm leading-7 text-foreground/88">{review.output}</div>
                </motion.div>
              ) : isWorking || starting ? (
                <motion.div key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex min-h-[280px] flex-col items-center justify-center text-center">
                  <ThinkingOrb state={orbState} size={64} theme="dark" aria-label="Codex is reviewing" />
                  <div className="mt-5 text-sm font-medium text-foreground">Tracing the exchange</div>
                  <div className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">Codex is reading the selected evidence in a read-only workspace.</div>
                </motion.div>
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-[280px] flex-col items-center justify-center text-center">
                  <div className="codex-orb-shell flex h-14 w-14 items-center justify-center">
                    <Sparkles className="h-5 w-5 text-accent" />
                  </div>
                  <div className="mt-5 text-sm font-medium text-foreground">A focused second pair of eyes</div>
                  <div className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Select a flow, choose the question, and keep bodies off unless they are needed.</div>
                </motion.div>
              )}
            </AnimatePresence>
            {error || review?.error ? (
              <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error || review?.error}</div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
