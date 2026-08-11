import { describe, expect, it } from 'vitest'
import pako from 'pako'
import { decodeFlowBody, getDefaultBodyView } from '../src/lib/flowDecode'

function toBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString('base64')
}

const gzipPayload = '{"kind":"synthetic","items":[1,2,3]}'
const gzipFlow = {
  response: {
    headers: {},
    body: '',
    body_base64: toBase64(pako.gzip(gzipPayload)),
  },
}
const jsonFlow = {
  response: {
    headers: { 'content-type': 'application/json' },
    body: '{"ok":true}',
    body_base64: toBase64(new TextEncoder().encode('{"ok":true}')),
  },
}

describe('decodeFlowBody', () => {
  const payload = '{"hello":"world"}'

  it('auto detects gzip when header missing', async () => {
    const result = await decodeFlowBody(
      {
        headers: gzipFlow.response.headers,
        body: gzipFlow.response.body,
        body_base64: gzipFlow.response.body_base64,
      },
      { decodeMode: 'auto' }
    )
    expect(result.notes.some((note) => note === 'decompress:gzip')).toBe(true)
    expect(result.decodedText.length).toBeGreaterThan(0)
  })

  it('auto detects deflate when header missing', async () => {
    const deflated = pako.deflate(payload)
    const body_base64 = toBase64(deflated)
    const result = await decodeFlowBody({ body_base64 }, { decodeMode: 'auto' })
    expect(result.decodedText).toBe(payload)
    expect(result.notes.some((note) => note === 'decompress:deflate')).toBe(true)
  })

  it('manual none skips decompression', async () => {
    const result = await decodeFlowBody(
      {
        headers: gzipFlow.response.headers,
        body: gzipFlow.response.body,
        body_base64: gzipFlow.response.body_base64,
      },
      { decodeMode: 'none' }
    )
    expect(result.notes.some((note) => note.startsWith('decompress:'))).toBe(false)
  })

  it('forced wrong decompression yields error', async () => {
    const deflated = pako.deflateRaw(payload)
    const body_base64 = toBase64(deflated)
    const result = await decodeFlowBody({ body_base64 }, { decodeMode: 'gzip' })
    expect(result.error).toBeTruthy()
  })
})

describe('getDefaultBodyView', () => {
  it('prefers json for json content-type', () => {
    const view = getDefaultBodyView(
      jsonFlow.response.headers,
      jsonFlow.response.body,
      jsonFlow.response.body_base64,
      null
    )
    expect(view).toBe('json')
  })

  it('falls back to proto when content-type is not json', () => {
    const view = getDefaultBodyView({ 'content-type': 'application/octet-stream' }, null, null, { ok: true })
    expect(view).toBe('proto')
  })
})
