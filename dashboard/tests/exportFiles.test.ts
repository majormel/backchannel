import { afterEach, describe, expect, it, vi } from 'vitest'
import { getExportFileDetails, getExportFileName, saveExportData } from '../src/lib/exportFiles'

const originalCreateElement = document.createElement.bind(document)
const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL
const originalShowSaveFilePicker = (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL
  URL.revokeObjectURL = originalRevokeObjectURL
  ;(window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker = originalShowSaveFilePicker
  vi.restoreAllMocks()
})

describe('getExportFileDetails', () => {
  it('maps formats to expected extensions and mime types', () => {
    expect(getExportFileDetails('json')).toEqual({
      extension: 'json',
      mimeType: 'application/json',
      description: 'JSON document',
    })
    expect(getExportFileDetails('jsonl')).toEqual({
      extension: 'jsonl',
      mimeType: 'application/x-ndjson',
      description: 'JSON Lines document',
    })
    expect(getExportFileDetails('curl')).toEqual({
      extension: 'sh',
      mimeType: 'text/x-shellscript',
      description: 'Shell script',
    })
  })
})

describe('getExportFileName', () => {
  it('builds a deterministic file name from the flow count and format', () => {
    const now = new Date('2026-03-12T08:43:45.999Z')
    expect(getExportFileName(3, 'curl', now)).toBe('flows-3-2026-03-12T08-43-45.sh')
  })
})

describe('saveExportData', () => {
  it('uses the save picker when available', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const close = vi.fn().mockResolvedValue(undefined)
    ;(window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({ write, close }),
    })

    const result = await saveExportData('hello', 'flows-1.json', 'json')

    expect(result).toBe('saved')
    expect(write).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('falls back to a browser download when the save picker is unavailable', async () => {
    const anchor = document.createElement('a')
    const click = vi.spyOn(anchor, 'click').mockImplementation(() => {})
    const createElement = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      if (tagName === 'a') {
        return anchor
      }
      return originalCreateElement(tagName)
    }) as typeof document.createElement)
    URL.createObjectURL = vi.fn().mockReturnValue('blob:test')
    URL.revokeObjectURL = vi.fn()
    ;(window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker = undefined

    const result = await saveExportData('hello', 'flows-1.jsonl', 'jsonl')

    expect(result).toBe('downloaded')
    expect(createElement).toHaveBeenCalledWith('a')
    expect(click).toHaveBeenCalledTimes(1)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })

  it('treats picker cancellation as a no-op', async () => {
    ;(window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker = vi.fn().mockRejectedValue({ name: 'AbortError' })

    const result = await saveExportData('hello', 'flows-1.json', 'json')

    expect(result).toBe('cancelled')
  })
})
