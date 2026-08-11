export type ExportFormat = 'json' | 'jsonl' | 'curl'

type SaveResult = 'saved' | 'downloaded' | 'cancelled'

type SaveFilePicker = (options?: {
  suggestedName?: string
  types?: Array<{
    description?: string
    accept: Record<string, string[]>
  }>
}) => Promise<{
  createWritable: () => Promise<{
    write: (data: Blob | string) => Promise<void>
    close: () => Promise<void>
  }>
}>

export function getExportFileDetails(format: ExportFormat) {
  switch (format) {
    case 'json':
      return { extension: 'json', mimeType: 'application/json', description: 'JSON document' }
    case 'jsonl':
      return { extension: 'jsonl', mimeType: 'application/x-ndjson', description: 'JSON Lines document' }
    case 'curl':
      return { extension: 'sh', mimeType: 'text/x-shellscript', description: 'Shell script' }
  }
}

export function getExportFileName(flowCount: number, format: ExportFormat, now = new Date()) {
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `flows-${flowCount}-${timestamp}.${getExportFileDetails(format).extension}`
}

export function supportsExportSavePicker() {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window
}

function downloadExportData(data: string, fileName: string, mimeType: string) {
  const blob = new Blob([data], { type: `${mimeType};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function isAbortError(error: unknown) {
  return !!error && typeof error === 'object' && 'name' in error && (error as { name?: string }).name === 'AbortError'
}

export async function saveExportData(data: string, fileName: string, format: ExportFormat): Promise<SaveResult> {
  const { extension, mimeType, description } = getExportFileDetails(format)
  const showSaveFilePicker = (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker

  if (showSaveFilePicker) {
    try {
      const handle = await showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description,
            accept: { [mimeType]: [`.${extension}`] },
          },
        ],
      })
      const writable = await handle.createWritable()
      await writable.write(new Blob([data], { type: `${mimeType};charset=utf-8` }))
      await writable.close()
      return 'saved'
    } catch (error) {
      if (isAbortError(error)) {
        return 'cancelled'
      }
    }
  }

  downloadExportData(data, fileName, mimeType)
  return 'downloaded'
}
