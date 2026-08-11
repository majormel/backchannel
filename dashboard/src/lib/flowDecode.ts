import pako from 'pako'

export type BodyView = 'decoded' | 'text' | 'base64' | 'json' | 'proto'
export type DecodeMode = 'auto' | 'none' | 'gzip' | 'deflate'

export type DecodedBody = {
  decodedText: string
  prettyJson: string | null
  notes: string[]
  error: string | null
  contentType: string | null
  contentEncoding: string | null
  isBinary: boolean
  byteLength: number
}

type BodyPart = {
  headers?: Record<string, string> | null
  body?: string | null
  body_base64?: string | null
}

const textDecoder = new TextDecoder()

function headerValue(headers: Record<string, string> | null | undefined, name: string) {
  if (!headers) return null
  const target = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value
  }
  return null
}

export function isJsonContentType(value: string | null | undefined) {
  if (!value) return false
  const lower = value.toLowerCase()
  return lower.includes('application/json') || lower.includes('+json')
}

function isTextualContentType(value: string | null | undefined) {
  if (!value) return false
  const lower = value.toLowerCase()
  return (
    lower.startsWith('text/') ||
    lower.includes('application/json') ||
    lower.includes('+json') ||
    lower.includes('application/xml') ||
    lower.includes('+xml') ||
    lower.includes('application/javascript') ||
    lower.includes('application/x-javascript') ||
    lower.includes('application/x-www-form-urlencoded') ||
    lower.includes('application/graphql') ||
    lower.includes('image/svg+xml')
  )
}

export function getDefaultBodyView(
  headers: Record<string, string> | null | undefined,
  body: string | null | undefined,
  bodyBase64: string | null | undefined,
  bodyProto?: unknown
): BodyView {
  const contentType = headerValue(headers, 'content-type')
  if (isJsonContentType(contentType)) return 'json'
  if (bodyProto) return 'proto'
  if (bodyBase64) return 'decoded'
  if (body) return 'text'
  return 'base64'
}

function base64ToBytes(value: string) {
  const cleaned = value.replace(/\s+/g, '')
  if (!cleaned) return null
  const binary = atob(cleaned)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function detectCompression(bytes: Uint8Array) {
  if (bytes.length < 2) return null
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return 'gzip'
  const cmf = bytes[0]
  const flg = bytes[1]
  if ((cmf & 0x0f) === 8) {
    const check = ((cmf << 8) + flg) % 31
    if (check === 0) return 'deflate'
  }
  return null
}

function normalizeEncoding(value: string | null) {
  if (!value) return null
  const lower = value.toLowerCase()
  if (lower.includes('gzip')) return 'gzip'
  if (lower.includes('deflate')) return 'deflate'
  return null
}

function applyDeflate(bytes: Uint8Array) {
  try {
    return pako.inflate(bytes)
  } catch {
    return pako.inflateRaw(bytes)
  }
}

function countReplacementCharacters(value: string) {
  let count = 0
  for (const char of value) {
    if (char === '\uFFFD') {
      count += 1
    }
  }
  return count
}

function isProbablyBinary(
  bytes: Uint8Array | null,
  contentType: string | null,
  decodedText: string
) {
  if (!bytes || bytes.length === 0) {
    return false
  }

  if (isTextualContentType(contentType)) {
    return false
  }

  if (contentType?.toLowerCase().includes('octet-stream')) {
    return true
  }

  let suspicious = 0
  for (const byte of bytes) {
    if (byte === 0) {
      suspicious += 3
    } else if ((byte < 7 || (byte > 14 && byte < 32) || byte === 127)) {
      suspicious += 1
    }
  }

  const replacementRatio = decodedText.length > 0 ? countReplacementCharacters(decodedText) / decodedText.length : 0
  return suspicious / bytes.length > 0.08 || replacementRatio > 0.02
}

function decompressBytes(
  bytes: Uint8Array,
  decodeMode: DecodeMode,
  contentEncoding: string | null
) {
  const notes: string[] = []
  let error: string | null = null
  let mode = decodeMode
  if (decodeMode === 'auto') {
    const headerMode = normalizeEncoding(contentEncoding)
    if (headerMode) {
      mode = headerMode
    } else {
      const detected = detectCompression(bytes)
      if (detected) {
        mode = detected
      } else {
        mode = 'none'
      }
    }
  }
  if (mode === 'none') {
    return { bytes, notes, error }
  }
  try {
    if (mode === 'gzip') {
      bytes = pako.ungzip(bytes)
    } else if (mode === 'deflate') {
      bytes = applyDeflate(bytes)
    }
    notes.push(`decompress:${mode}`)
  } catch (exc) {
    error = exc instanceof Error ? exc.message : 'decompression failed'
  }
  return { bytes, notes, error }
}

export async function decodeFlowBody(
  part: BodyPart,
  opts?: { decodeMode?: DecodeMode }
): Promise<DecodedBody> {
  const contentType = headerValue(part.headers, 'content-type')
  const contentEncoding = headerValue(part.headers, 'content-encoding')
  const decodeMode = opts?.decodeMode ?? 'auto'
  const notes: string[] = []
  let decodedText = ''
  let prettyJson: string | null = null
  let error: string | null = null
  let bytes: Uint8Array | null = null

  if (part.body_base64) {
    try {
      bytes = base64ToBytes(part.body_base64)
      if (bytes) {
        notes.push('base64')
      } else {
        error = 'invalid base64 body'
      }
    } catch (exc) {
      error = exc instanceof Error ? exc.message : 'invalid base64 body'
    }
  }

  if (bytes) {
    const result = decompressBytes(bytes, decodeMode, contentEncoding)
    bytes = result.bytes
    notes.push(...result.notes)
    if (result.error) {
      error = result.error
    }
  }

  if (bytes) {
    decodedText = textDecoder.decode(bytes)
  } else if (part.body) {
    decodedText = part.body
  }

  const isBinary = isProbablyBinary(bytes, contentType, decodedText)

  const trimmed = decodedText.trim()
  if (decodedText && (isJsonContentType(contentType) || trimmed.startsWith('{') || trimmed.startsWith('['))) {
    try {
      const parsed = JSON.parse(decodedText)
      prettyJson = JSON.stringify(parsed, null, 2)
    } catch {
      prettyJson = null
    }
  }

  return {
    decodedText,
    prettyJson,
    notes,
    error,
    contentType,
    contentEncoding,
    isBinary,
    byteLength: bytes?.length || decodedText.length,
  }
}
