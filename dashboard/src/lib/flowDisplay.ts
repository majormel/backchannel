export function getMethodColor(method: string): string {
  const colors: Record<string, string> = {
    GET: 'border-sky-200/16 bg-sky-300/12 text-sky-100',
    POST: 'border-emerald-200/16 bg-emerald-300/12 text-emerald-100',
    PUT: 'border-amber-200/16 bg-amber-300/12 text-amber-100',
    PATCH: 'border-amber-200/16 bg-amber-300/12 text-amber-100',
    DELETE: 'border-rose-200/16 bg-rose-300/12 text-rose-100',
    HEAD: 'border-violet-200/16 bg-violet-300/12 text-violet-100',
    OPTIONS: 'border-slate-200/16 bg-slate-200/10 text-slate-100',
  }
  return colors[method?.toUpperCase()] || 'border-white/10 bg-white/[0.06] text-foreground/82'
}

export function getStatusBadgeColor(status: number): string {
  if (status >= 200 && status < 300) {
    return 'border-emerald-200/16 bg-emerald-300/12 text-emerald-100'
  }
  if (status >= 300 && status < 400) {
    return 'border-sky-200/16 bg-sky-300/12 text-sky-100'
  }
  if (status >= 400 && status < 500) {
    return 'border-amber-200/16 bg-amber-300/12 text-amber-100'
  }
  if (status >= 500) {
    return 'border-rose-200/16 bg-rose-300/12 text-rose-100'
  }
  return 'border-white/10 bg-white/[0.06] text-foreground/82'
}

export function getResponseSizeBadgeColor(bodySizeBytes: number): string {
  if (bodySizeBytes < 10 * 1024) {
    return 'border-emerald-200/16 bg-emerald-300/12 text-emerald-100'
  }
  if (bodySizeBytes <= 100 * 1024) {
    return 'border-amber-200/16 bg-amber-300/12 text-amber-100'
  }
  return 'border-rose-200/16 bg-rose-300/12 text-rose-100'
}

export function truncateUrl(url: string, maxLength: number = 60): string {
  if (!url || url.length <= maxLength) return url

  try {
    const urlObj = new URL(url)
    const pathname = urlObj.pathname
    const search = urlObj.search

    // If just pathname + search is short enough, show domain/.../end
    const pathAndQuery = pathname + search
    if (pathAndQuery.length <= maxLength - 10) {
      return urlObj.origin + '/...' + pathAndQuery.slice(-(maxLength - 10))
    }

    // Otherwise truncate the middle
    const half = Math.floor((maxLength - 3) / 2)
    return url.substring(0, half) + '...' + url.substring(url.length - half)
  } catch {
    // Not a valid URL, just truncate
    const half = Math.floor((maxLength - 3) / 2)
    return url.substring(0, half) + '...' + url.substring(url.length - half)
  }
}

export function getUrlDisplayParts(
  url: string,
  fallbackHost?: string | null,
  fallbackPath?: string | null
): { host: string; path: string } {
  try {
    const parsed = new URL(url)
    return {
      host: fallbackHost || parsed.host || 'Unknown host',
      path: fallbackPath || `${parsed.pathname}${parsed.search}` || '/',
    }
  } catch {
    return {
      host: fallbackHost || 'Unknown host',
      path: fallbackPath || url || '/',
    }
  }
}

export function truncatePath(path: string, maxLength: number = 64): string {
  if (!path || path.length <= maxLength) {
    return path
  }

  const leading = Math.ceil((maxLength - 1) * 0.68)
  const trailing = maxLength - leading - 1
  return `${path.slice(0, leading)}…${path.slice(-trailing)}`
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function getDurationColor(durationMs: number): string {
  if (durationMs < 100) return 'text-emerald-200'
  if (durationMs < 500) return 'text-amber-200'
  return 'text-rose-200'
}

const HOST_TAG_RULES: Array<{ tag: string; test: RegExp }> = [
  { tag: 'stripe', test: /(^|\.)stripe\.com$/ },
  { tag: 'github', test: /(^|\.)github(usercontent)?\.com$/ },
  { tag: 'ai', test: /(^|\.)(openai|anthropic|claude|cohere|mistral)\.(com|ai)$/ },
  { tag: 'maps', test: /(^|\.)(mapbox|googleapis)\.com$/ },
  { tag: 'analytics', test: /(^|\.)(google-analytics|analytics|segment|mixpanel|amplitude|sentry)\.(com|io)$/ },
  { tag: 'cdn', test: /(^|\.)(cloudfront|akamai|fastly|jsdelivr|unpkg|cdn)\.[a-z.]+$/ },
]

const PATH_TAG_RULES: Array<{ tag: string; test: RegExp }> = [
  { tag: 'graphql', test: /\/graphql\b/i },
  { tag: 'api', test: /\/(api|v\d+)\// },
]

const STATIC_EXT = /\.(js|mjs|css|woff2?|ttf|otf|map|ico)(\?|$)/i
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i

export function deriveTags(url: string, host?: string | null, contentType?: string | null): string[] {
  const tags = new Set<string>()
  let parsedHost = host || ''
  let path = ''
  try {
    const parsed = new URL(url)
    parsedHost = parsedHost || parsed.host
    path = parsed.pathname + parsed.search
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname.endsWith('.local')) {
      tags.add('local')
    }
  } catch {
    path = url
  }

  const hostname = parsedHost.split(':')[0].toLowerCase()
  for (const rule of HOST_TAG_RULES) {
    if (rule.test.test(hostname)) tags.add(rule.tag)
  }
  for (const rule of PATH_TAG_RULES) {
    if (rule.test.test(path)) tags.add(rule.tag)
  }

  const ct = (contentType || '').toLowerCase()
  if (STATIC_EXT.test(path) || ct.includes('javascript') || ct.includes('text/css')) {
    tags.add('static')
  }
  if (IMAGE_EXT.test(path) || ct.startsWith('image/')) {
    tags.add('image')
  }
  if (url.startsWith('ws://') || url.startsWith('wss://')) {
    tags.add('websocket')
  }

  return Array.from(tags).slice(0, 3)
}

export function parseClient(userAgent?: string | null): string | null {
  if (!userAgent) return null
  const ua = userAgent
  const rules: Array<{ label: string; test: RegExp; version?: RegExp }> = [
    { label: 'Postman', test: /PostmanRuntime/i },
    { label: 'Insomnia', test: /insomnia/i },
    { label: 'curl', test: /^curl\//i },
    { label: 'VS Code', test: /VSCode|Code\//i },
    { label: 'Cursor', test: /Cursor/i },
    { label: 'Edge', test: /Edg\//i, version: /Edg\/(\d+)/ },
    { label: 'Chrome', test: /Chrome\//i, version: /Chrome\/(\d+)/ },
    { label: 'Firefox', test: /Firefox\//i, version: /Firefox\/(\d+)/ },
    { label: 'Safari', test: /Version\/.*Safari/i, version: /Version\/(\d+)/ },
  ]
  for (const rule of rules) {
    if (rule.test.test(ua)) {
      const major = rule.version ? ua.match(rule.version)?.[1] : undefined
      if (/iPhone|iPad/i.test(ua) && (rule.label === 'Safari' || rule.label === 'Chrome')) {
        return /iPad/i.test(ua) ? 'iPad' : 'iPhone'
      }
      return major ? `${rule.label} ${major}` : rule.label
    }
  }
  return null
}
