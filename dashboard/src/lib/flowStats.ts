import type { FlowSummary, ProtocolFilter } from './types'

export type TrafficStats = {
  requests: number
  responses: number
  totalBytes: number
  avgBytes: number
  errorCount: number
}

export type ProtocolBreakdown = {
  http: number
  https: number
  websocket: number
  other: number
  total: number
}

export type ClientCount = {
  client: string
  count: number
}

function scheme(url: string): 'http' | 'https' | 'websocket' | 'other' {
  if (url.startsWith('https://')) return 'https'
  if (url.startsWith('http://')) return 'http'
  if (url.startsWith('wss://') || url.startsWith('ws://')) return 'websocket'
  return 'other'
}

export function computeTrafficStats(flows: FlowSummary[]): TrafficStats {
  let responses = 0
  let totalBytes = 0
  let errorCount = 0
  for (const flow of flows) {
    const status = flow.response?.status_code
    if (status) {
      responses += 1
      if (status >= 400) errorCount += 1
    }
    if (typeof flow.response?.body_size === 'number') {
      totalBytes += flow.response.body_size
    }
  }
  return {
    requests: flows.length,
    responses,
    totalBytes,
    avgBytes: flows.length ? Math.round(totalBytes / flows.length) : 0,
    errorCount,
  }
}

export function computeProtocolBreakdown(flows: FlowSummary[]): ProtocolBreakdown {
  const breakdown: ProtocolBreakdown = { http: 0, https: 0, websocket: 0, other: 0, total: flows.length }
  for (const flow of flows) {
    breakdown[scheme(flow.request?.url || '')] += 1
  }
  return breakdown
}

export function computeClientCounts(flows: FlowSummary[]): ClientCount[] {
  const counts = new Map<string, number>()
  for (const flow of flows) {
    const client = flow.client?.[0]
    if (!client) continue
    counts.set(client, (counts.get(client) || 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([client, count]) => ({ client, count }))
    .sort((a, b) => b.count - a.count)
}

export function matchesProtocol(url: string, filter: ProtocolFilter): boolean {
  if (filter === 'all') return true
  return scheme(url) === filter
}
