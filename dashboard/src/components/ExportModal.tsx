import { useEffect, useMemo, useState } from 'react'
import { Download, Copy, Check, FileJson, FileText, Terminal } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { exportFlows } from '@/lib/api'
import { getExportFileName, saveExportData, supportsExportSavePicker, type ExportFormat } from '@/lib/exportFiles'

interface ExportModalProps {
  flowIds: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string | null
}

export function ExportModal({ flowIds, open, onOpenChange, token }: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('json')
  const [exportData, setExportData] = useState('')
  const [copied, setCopied] = useState(false)
  const [savedState, setSavedState] = useState<'idle' | 'saved' | 'downloaded'>('idle')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || flowIds.length === 0) {
      setExportData('')
      setError(null)
      setSavedState('idle')
      return
    }

    let active = true
    setLoading(true)
    setError(null)

    exportFlows({ flow_ids: flowIds, format }, token)
      .then((result) => {
        if (!active) return
        setExportData(result.data)
      })
      .catch((err) => {
        if (!active) return
        setExportData('')
        setError(err instanceof Error ? err.message : 'Export failed')
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [flowIds, format, open, token])

  const fileName = useMemo(() => {
    return getExportFileName(flowIds.length, format)
  }, [flowIds.length, format])

  const supportsSavePicker = supportsExportSavePicker()

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportData)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Silently fail if clipboard is not available
    }
  }

  const handleSave = async () => {
    const result = await saveExportData(exportData, fileName, format)
    if (result === 'cancelled') {
      return
    }
    setSavedState(result)
    window.setTimeout(() => setSavedState('idle'), 2000)
  }

  const formatOptions: { value: ExportFormat; label: string; icon: React.ReactNode; description: string }[] = [
    { value: 'json', label: 'JSON', icon: <FileJson className="h-4 w-4" />, description: 'Pretty-printed array' },
    { value: 'jsonl', label: 'JSONL', icon: <FileText className="h-4 w-4" />, description: 'One flow per line' },
    { value: 'curl', label: 'cURL', icon: <Terminal className="h-4 w-4" />, description: 'Shell script with requests' },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-cyan-400" />
            Export Selected Flows
          </DialogTitle>
          <DialogDescription>
            {flowIds.length} flow{flowIds.length !== 1 ? 's' : ''} selected for export preview and save.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Format Selection */}
          <div className="grid grid-cols-3 gap-2">
            {formatOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={format === option.value}
                onClick={() => setFormat(option.value)}
                className={`flex flex-col items-center gap-2 rounded-lg border p-3 transition-[background-color,border-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  format === option.value
                    ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400'
                    : 'border-border/50 hover:border-cyan-500/30 hover:bg-cyan-500/5'
                }`}
              >
                {option.icon}
                <span className="text-sm font-medium">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </button>
            ))}
          </div>

          {/* Preview */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-muted-foreground">Preview</span>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">{exportData.length.toLocaleString()} characters</div>
                <div className="text-xs text-muted-foreground">{fileName}</div>
              </div>
            </div>
            <div className="mb-2 text-xs text-muted-foreground">Preview shows the first 5,000 characters. Saved export includes full selected flow data.</div>
            <div className="flex-1 overflow-auto rounded-lg border border-border/50 bg-muted/30 p-4">
              {loading ? (
                <div className="text-sm text-muted-foreground">Preparing export preview…</div>
              ) : error ? (
                <div className="text-sm text-destructive">{error}</div>
              ) : (
                <pre className="text-xs font-mono whitespace-pre-wrap break-all text-foreground/80">
                  {exportData.slice(0, 5000)}
                  {exportData.length > 5000 && (
                    <span className="text-muted-foreground italic">
                      {'\n\n… ({0} more characters)'.replace('{0}', (exportData.length - 5000).toLocaleString())}
                    </span>
                  )}
                </pre>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleCopy}
                disabled={loading || !!error || !exportData}
                className={copied ? 'text-green-600 border-green-200 bg-green-50' : ''}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-1.5" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-1.5" />
                    Copy
                  </>
                )}
              </Button>
              <Button onClick={handleSave} className="bg-cyan-600 hover:bg-cyan-700" disabled={loading || !!error || !exportData}>
                {savedState === 'idle' ? (
                  <>
                    <Download className="h-4 w-4 mr-1.5" />
                    {supportsSavePicker ? 'Save As' : 'Download'}
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-1.5" />
                    {savedState === 'saved' ? 'Saved' : 'Downloaded'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
