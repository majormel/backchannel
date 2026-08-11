import { FlowInspector } from './inspector/FlowInspector'
import type { Flow } from '@/lib/types'

type FlowDetailContentProps = {
  flow: Flow | null
  loading?: boolean
  onReplayRequest: (flow: Flow) => void
  className?: string
  highlightQuery?: string
}

export function FlowDetailContent(props: FlowDetailContentProps) {
  return <FlowInspector {...props} />
}
