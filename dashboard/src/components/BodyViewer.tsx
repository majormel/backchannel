import { useEffect, useMemo, useState } from 'react'
import { Button } from './ui/button'
import JsonHighlighter from './JsonHighlighter'
import { HighlightedText } from './HighlightedText'
import { decodeFlowBody, getDefaultBodyView, type BodyView, type DecodedBody, type DecodeMode } from '@/lib/flowDecode'
import { formatBytes } from '@/lib/flowDisplay'

type BodyViewerProps = {
  resetKey?: string
  title: string
  headers?: Record<string, string> | null
  body?: string | null
  body_base64?: string | null
  body_proto?: unknown
  highlightQuery?: string
}

const decodeOptions: DecodeMode[] = ['auto', 'none', 'gzip', 'deflate']

function BodyViewer({ resetKey, title, headers, body, body_base64, body_proto, highlightQuery = '' }: BodyViewerProps) {
  const [view, setView] = useState<BodyView>('decoded')
  const [decoded, setDecoded] = useState<DecodedBody | null>(null)
  const [loading, setLoading] = useState(false)
  const [decodeMode, setDecodeMode] = useState<DecodeMode>('auto')
  const [viewDirty, setViewDirty] = useState(false)
  const headersKey = useMemo(() => JSON.stringify(headers || {}), [headers])
  const protoKey = useMemo(() => JSON.stringify(body_proto ?? null), [body_proto])
  const defaultView = useMemo(
    () => getDefaultBodyView(headers, body, body_base64, body_proto),
    [headersKey, body, body_base64, protoKey]
  )
  const viewOptions = useMemo(() => {
    const options: BodyView[] = ['decoded', 'text', 'base64', 'json']
    if (body_proto) options.push('proto')
    return options
  }, [body_proto])

  useEffect(() => {
    if (!viewDirty) {
      setView(defaultView)
    }
  }, [defaultView, viewDirty])

  useEffect(() => {
    setViewDirty(false)
    setDecodeMode('auto')
    setView(defaultView)
  }, [resetKey, defaultView])

  useEffect(() => {
    let active = true
    setDecoded(null)
    if (!body && !body_base64) {
      setLoading(false)
      return () => {
        active = false
      }
    }
    setLoading(true)
    decodeFlowBody({ headers: headers || {}, body, body_base64 }, { decodeMode })
      .then((result) => {
        if (active) {
          setDecoded(result)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (active) {
          setDecoded({
            decodedText: '',
            prettyJson: null,
            notes: [],
            error: err instanceof Error ? err.message : 'decode failed',
            contentType: null,
            contentEncoding: null,
            isBinary: false,
            byteLength: 0,
          })
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [headersKey, body, body_base64, decodeMode])

  const headerEntries = useMemo(() => Object.entries(headers || {}), [headersKey])

  let content = ''
  if (view === 'json') {
    if (decoded?.prettyJson) {
      content = decoded.prettyJson
    } else if (decoded?.decodedText) {
      content = 'JSON not available'
    }
  } else if (view === 'decoded') {
    content = decoded?.decodedText || ''
  } else if (view === 'base64') {
    content = body_base64 || ''
  } else if (view === 'proto') {
    if (body_proto) {
      try {
        content = JSON.stringify(body_proto, null, 2)
      } catch {
        content = 'Proto not available'
      }
    }
  } else {
    content = body || decoded?.decodedText || ''
  }

  if (!content && !loading) {
    content = 'No content'
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="flex gap-1 flex-wrap">
          {viewOptions.map((option) => (
            <Button
              key={option}
              size="sm"
              variant={view === option ? 'secondary' : 'outline'}
              onClick={() => {
                setView(option)
                setViewDirty(true)
              }}
              className="rounded-full"
            >
              {option}
            </Button>
          ))}
        </div>
      </div>
      <div className="glass-soft p-4 text-xs">
        <div className="mb-3 flex flex-wrap gap-2">
          {decoded?.contentType ? (
            <span className="rounded-full border border-hairline bg-white/[0.05] px-2.5 py-1 text-[11px] text-foreground/80">
              {decoded.contentType}
            </span>
          ) : null}
          {decoded?.contentEncoding ? (
            <span className="rounded-full border border-hairline bg-white/[0.05] px-2.5 py-1 text-[11px] text-muted-foreground">
              encoding {decoded.contentEncoding}
            </span>
          ) : null}
          {decoded?.byteLength ? (
            <span className="rounded-full border border-hairline bg-white/[0.05] px-2.5 py-1 text-[11px] text-muted-foreground">
              {formatBytes(decoded.byteLength)}
            </span>
          ) : null}
        </div>
        {headerEntries.length === 0 ? (
          <div className="text-muted-foreground">No headers</div>
        ) : (
          <div className="space-y-1">
            {headerEntries.map(([key, value]) => (
                <div key={`${key}-${value}`} className="flex gap-2">
                  <div className="w-1/3 break-all text-muted-foreground">
                    <HighlightedText text={key} query={highlightQuery} />
                  </div>
                  <div className="w-2/3 break-all text-foreground/82">
                    <HighlightedText text={value} query={highlightQuery} />
                  </div>
                </div>
              ))}
            </div>
        )}
      </div>
      <div className="space-y-2">
        {decoded?.notes?.length ? (
          <div className="text-xs text-muted-foreground">Decoded: {decoded.notes.join(', ')}</div>
        ) : null}
        {decoded?.error ? (
          <div className="text-xs text-destructive">Decode error: {decoded.error}</div>
        ) : null}
        {body_base64 ? (
          <div className="flex flex-wrap gap-1">
            {decodeOptions.map((option) => (
              <Button
                key={option}
                size="sm"
                variant={decodeMode === option ? 'secondary' : 'outline'}
                onClick={() => setDecodeMode(option)}
                className="rounded-full"
              >
                {option}
              </Button>
            ))}
          </div>
        ) : null}
        {loading ? (
          <div className="text-xs text-muted-foreground">Decoding…</div>
        ) : view === 'decoded' && decoded?.isBinary && !body_proto ? (
          <div className="glass-soft space-y-3 p-4 text-xs">
            <div>
              <div className="text-sm font-medium text-foreground">Binary payload detected</div>
              <div className="mt-1 text-muted-foreground">
                This body looks like binary data rather than readable text, so the decoded preview would be misleading.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-hairline bg-white/[0.05] px-2.5 py-1 text-[11px] text-foreground/80">
                Use base64 for raw bytes
              </span>
              <span className="rounded-full border border-hairline bg-white/[0.05] px-2.5 py-1 text-[11px] text-muted-foreground">
                Proto view appears automatically when structured decode succeeds
              </span>
            </div>
          </div>
        ) : view === 'json' || (decoded?.contentType?.includes('json') && view === 'decoded') ? (
          <div className="glass-soft overflow-auto p-4 text-xs">
            <JsonHighlighter content={content} highlightQuery={highlightQuery} />
          </div>
        ) : (
          <pre className="glass-soft overflow-auto p-4 text-xs whitespace-pre-wrap break-words text-foreground/82">
            <HighlightedText text={content} query={highlightQuery} />
          </pre>
        )}
      </div>
    </div>
  )
}

export default BodyViewer
