import type { Flow } from './types'

export function flowToCurl(flow: Flow): string {
  const request = flow.request
  if (!request) return ''

  const method = request.method || 'GET'
  const url = request.url || ''
  const headers = request.headers || {}

  let curl = `curl -X ${method}`

  const skipHeaders = new Set([
    'host',
    'content-length',
    'connection',
    'accept-encoding',
    'accept-language',
  ])

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase()
    if (skipHeaders.has(lowerKey)) continue
    const escapedValue = value.replace(/'/g, "'\\''")
    curl += ` \\\n  -H '${key}: ${escapedValue}'`
  }

  if (request.body) {
    const escapedBody = request.body.replace(/'/g, "'\\''")
    curl += ` \\\n  -d '${escapedBody}'`
  } else if (request.body_base64) {
    try {
      const decoded = atob(request.body_base64)
      const escapedBody = decoded.replace(/'/g, "'\\''")
      curl += ` \\\n  -d '${escapedBody}'`
    } catch {
      curl += ` \\\n  --data-binary @<(echo '${request.body_base64}' | base64 -d)`
    }
  }

  curl += ` \\\n  '${url}'`

  return curl
}
