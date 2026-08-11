import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { FlowDetailContent } from './FlowDetailContent'
import type { Flow } from '@/lib/types'

type FlowInspectModalProps = {
  flow: Flow | null
  loading?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onReplayRequest: (flow: Flow) => void
  highlightQuery?: string
}

function FlowInspectModal({ flow, loading = false, open, onOpenChange, onReplayRequest, highlightQuery = '' }: FlowInspectModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-hidden p-0">
        <DialogHeader className="space-y-2">
          <DialogTitle>Flow Detail</DialogTitle>
          <DialogDescription>
            Inspect a single captured flow, review headers and bodies, replay the request, or copy it as cURL.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[calc(90vh-4.5rem)] overflow-auto px-4 pb-4">
          <FlowDetailContent flow={flow} loading={loading} onReplayRequest={onReplayRequest} highlightQuery={highlightQuery} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default FlowInspectModal
