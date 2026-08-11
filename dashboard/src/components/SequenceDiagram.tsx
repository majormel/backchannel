import { useEffect, useRef, useState } from 'react'
import type { SequenceData } from '@/lib/types'

interface SequenceDiagramProps {
  sequenceData: SequenceData
}

type MermaidInstance = typeof import('mermaid').default

function safeDiagramLabel(value: unknown, maxLength = 160): string {
  const text = String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^a-zA-Z0-9 ._:/?&=%@()+-]/g, '_')
    .trim()
  return (text || 'unknown').slice(0, maxLength)
}

export function buildSequenceDiagramSyntax(sequenceData: SequenceData): string {
  const { participants, messages } = sequenceData
  const participantIds = new Map(participants.map((participant, index) => [participant, `P${index + 1}`]))
  let syntax = 'sequenceDiagram\n'

  participants.forEach(participant => {
    syntax += `  participant ${participantIds.get(participant)} as ${safeDiagramLabel(participant)}\n`
  })

  messages.forEach((msg) => {
    const fromSafe = participantIds.get(msg.from)
    const toSafe = participantIds.get(msg.to)
    if (!fromSafe || !toSafe) return
    const status = msg.status || 0
    const statusLabel = status >= 200 && status < 300 ? 'OK' : status >= 400 ? 'ERROR' : 'INFO'
    syntax += `  ${fromSafe}->>${toSafe}: [${statusLabel}] ${safeDiagramLabel(msg.method, 16)} ${safeDiagramLabel(msg.path)}\n`
  })

  return syntax
}

export function SequenceDiagram({ sequenceData }: SequenceDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mermaidRef = useRef<MermaidInstance | null>(null)
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sequenceData || !containerRef.current) return
    let active = true

    const renderDiagram = async () => {
      try {
        let mermaid = mermaidRef.current
        if (!mermaid) {
          const mod = await import('mermaid')
          mermaid = mod.default
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: 'dark',
            sequence: {
              showSequenceNumbers: true,
              actorFontSize: 14,
              noteFontSize: 14,
              messageFontSize: 14,
            },
          })
          mermaidRef.current = mermaid
        }
        const syntax = buildSequenceDiagramSyntax(sequenceData)
        const { svg } = await mermaid.render(`seq-${Date.now()}`, syntax)
        if (!active) return
        setSvg(svg)
        setError(null)
      } catch {
        if (!active) return
        setError('Failed to render sequence diagram')
      }
    }

    void renderDiagram()
    return () => {
      active = false
    }
  }, [sequenceData])

  if (error) {
    return (
      <div className="p-4 text-red-400 bg-red-500/10 rounded-lg border border-red-500/30">
        {error}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Request sequence diagram"
      className="overflow-auto bg-card/50 rounded-lg p-4"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
