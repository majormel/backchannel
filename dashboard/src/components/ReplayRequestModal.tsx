import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import BodyViewer from './BodyViewer'
import { replayRequest } from '@/lib/api'
import type { Flow, ReplayResponse } from '@/lib/types'

type ReplayRequestModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialFlow: Flow | null
  token: string | null
  embedded?: boolean
}

function headersToText(headers: Record<string, string> | null | undefined) {
  if (!headers) return ''
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')
}

function textToHeaders(text: string) {
  const headers: Record<string, string> = {}
  const lines = text.split(/\r?\n/)
  lines.forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    const idx = trimmed.indexOf(':')
    if (idx === -1) return
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim()
    if (key) {
      headers[key] = value
    }
  })
  return headers
}

function ReplayRequestModal({ open, onOpenChange, initialFlow, token, embedded = false }: ReplayRequestModalProps) {
  const [method, setMethod] = useState('GET')
  const [url, setUrl] = useState('')
  const [headersText, setHeadersText] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [sending, setSending] = useState(false)
  const [response, setResponse] = useState<ReplayResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open && !embedded) return
    if (initialFlow?.request) {
      setMethod(initialFlow.request.method || 'GET')
      setUrl(initialFlow.request.url || '')
      setHeadersText(headersToText(initialFlow.request.headers))
      setBodyText(initialFlow.request.body || '')
    } else {
      setMethod('GET')
      setUrl('')
      setHeadersText('')
      setBodyText('')
    }
    setResponse(null)
    setError(null)
  }, [open, initialFlow?.id])

  const parsedHeaders = useMemo(() => textToHeaders(headersText), [headersText])

  const handleSend = async () => {
    if (!url || !method) {
      setError('method and url are required')
      return
    }
    setSending(true)
    setError(null)
    setResponse(null)
    try {
      const result = await replayRequest(
        {
          method,
          url,
          headers: parsedHeaders,
          body: bodyText ? bodyText : null,
        },
        token
      )
      setResponse(result)
      if (result.error) {
        setError(result.error)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'request failed')
    } finally {
      setSending(false)
    }
  }

  const responseHeaders = response?.response?.headers || null
  const responseBody = response?.response?.body || null
  const responseBodyBase64 = response?.response?.body_base64 || null

  const form = (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="replay-method">Method</Label>
              <Input
                id="replay-method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label htmlFor="replay-url">URL</Label>
              <Input
                id="replay-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="replay-headers">Headers</Label>
            <Textarea
              id="replay-headers"
              value={headersText}
              onChange={(e) => setHeadersText(e.target.value)}
              placeholder="Header: value"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="replay-body">Body</Label>
            <Textarea
              id="replay-body"
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Request body"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleSend} disabled={sending}>
              {sending ? 'Sending…' : 'Send'}
            </Button>
          </div>
          {error ? <div className="text-sm text-destructive">{error}</div> : null}
          {response ? (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Status: {response.response?.status_code || '-'} {response.response?.reason || ''} | Time: {response.elapsed_ms ?? '-'}ms
              </div>
              <BodyViewer
                title="Response"
                headers={responseHeaders}
                body={responseBody}
                body_base64={responseBodyBase64}
              />
            </div>
          ) : null}
        </div>
  )

  if (embedded) {
    return (
      <div className="glass-panel overflow-auto p-5">
        <div className="mb-4">
          <div className="text-lg font-semibold text-foreground">Replay Request</div>
          <div className="text-sm text-muted-foreground">Adjust the captured request and send it again.</div>
        </div>
        {form}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Replay Request</DialogTitle>
          <DialogDescription>Adjust the captured request and send it again without leaving the dashboard.</DialogDescription>
        </DialogHeader>
        {form}
      </DialogContent>
    </Dialog>
  )
}

export default ReplayRequestModal
