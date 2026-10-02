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
      <DialogContent className="flex max-h-[90dvh] max-w-6xl flex-col gap-3 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-2 px-5 pb-1 pt-5 text-left">
          <DialogTitle className="pr-8 text-base">Flow Detail</DialogTitle>
          <DialogDescription>
            Inspect a single captured flow, review headers and bodies, replay the request, or copy it as cURL.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-auto px-4 pb-4">
          <FlowDetailContent flow={flow} loading={loading} onReplayRequest={onReplayRequest} highlightQuery={highlightQuery} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default FlowInspectModal
