import { describe, expect, it } from 'vitest'
import { computeClientCounts, computeProtocolBreakdown, computeTrafficStats, matchesProtocol } from '../src/lib/flowStats'
import { deriveTags, parseClient } from '../src/lib/flowDisplay'
import type { FlowSummary } from '../src/lib/types'

function makeFlow(overrides: Partial<FlowSummary> & { url: string }): FlowSummary {
  const { url, ...rest } = overrides
  return {
    ts: 1,
    id: Math.random().toString(36).slice(2),
    client: ['127.0.0.1', 5000],
    server: ['example.com', 443],
    request: { method: 'GET', url, host: null, path: null },
    response: { status_code: 200, reason: 'OK', body_size: 100 },
    ...rest,
  }
}

describe('computeTrafficStats', () => {
  it('counts requests, responses, sizes, and errors', () => {
    const flows = [
      makeFlow({ url: 'https://a.com/', response: { status_code: 200, reason: 'OK', body_size: 100 } }),
      makeFlow({ url: 'https://a.com/', response: { status_code: 404, reason: 'NF', body_size: 50 } }),
      makeFlow({ url: 'https://a.com/', response: { status_code: 500, reason: 'ERR', body_size: 0 } }),
    ]
    const stats = computeTrafficStats(flows)
    expect(stats.requests).toBe(3)
    expect(stats.responses).toBe(3)
    expect(stats.totalBytes).toBe(150)
    expect(stats.errorCount).toBe(2)
  })
})

describe('computeProtocolBreakdown', () => {
  it('splits by scheme', () => {
    const flows = [
      makeFlow({ url: 'https://a.com/' }),
      makeFlow({ url: 'http://b.com/' }),
      makeFlow({ url: 'wss://c.com/' }),
    ]
    const breakdown = computeProtocolBreakdown(flows)
    expect(breakdown.https).toBe(1)
    expect(breakdown.http).toBe(1)
    expect(breakdown.websocket).toBe(1)
    expect(breakdown.total).toBe(3)
  })
})

describe('computeClientCounts', () => {
  it('aggregates and sorts by count', () => {
    const flows = [
      makeFlow({ url: 'https://a.com/', client: ['10.0.0.1', 1] }),
      makeFlow({ url: 'https://a.com/', client: ['10.0.0.2', 1] }),
      makeFlow({ url: 'https://a.com/', client: ['10.0.0.1', 1] }),
    ]
    const counts = computeClientCounts(flows)
    expect(counts[0]).toEqual({ client: '10.0.0.1', count: 2 })
    expect(counts[1]).toEqual({ client: '10.0.0.2', count: 1 })
  })
})

describe('matchesProtocol', () => {
  it('matches by scheme and passes all', () => {
    expect(matchesProtocol('https://a.com', 'https')).toBe(true)
    expect(matchesProtocol('https://a.com', 'http')).toBe(false)
    expect(matchesProtocol('http://a.com', 'all')).toBe(true)
  })
})

describe('deriveTags', () => {
  it('tags api and graphql paths', () => {
    expect(deriveTags('https://x.com/api/v1/users')).toContain('api')
    expect(deriveTags('https://x.com/graphql')).toContain('graphql')
  })

  it('tags local hosts and static assets', () => {
    expect(deriveTags('http://localhost:3000/app.js')).toContain('local')
    expect(deriveTags('https://cdn.example.com/main.css')).toContain('static')
  })
})

describe('parseClient', () => {
  it('parses known user agents', () => {
    expect(parseClient('PostmanRuntime/7.36.0')).toBe('Postman')
    expect(parseClient('Mozilla/5.0 Chrome/124.0.0.0 Safari/537.36')).toBe('Chrome 124')
    expect(parseClient(null)).toBeNull()
  })
})
