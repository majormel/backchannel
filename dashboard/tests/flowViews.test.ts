import { afterEach, describe, expect, it } from 'vitest'
import { buildSavedFlowViewLabel, hasFlowSearchFilters, loadSavedFlowViews, serializeFlowSearchFilters } from '../src/lib/flowViews'

afterEach(() => {
  localStorage.clear()
})

describe('serializeFlowSearchFilters', () => {
  it('includes datetime filters in the active signature', () => {
    const first = serializeFlowSearchFilters({
      query: '',
      method: 'GET',
      statusMin: '',
      statusMax: '',
      timeFrom: '2026-03-12T08:00',
      timeTo: '',
    })
    const second = serializeFlowSearchFilters({
      query: '',
      method: 'GET',
      statusMin: '',
      statusMax: '',
      timeFrom: '2026-03-12T09:00',
      timeTo: '',
    })

    expect(first).not.toBe(second)
  })
})

describe('hasFlowSearchFilters', () => {
  it('treats datetime-only ranges as active filters', () => {
    expect(hasFlowSearchFilters({
      query: '',
      method: '',
      statusMin: '',
      statusMax: '',
      timeFrom: '',
      timeTo: '2026-03-12T10:30',
    })).toBe(true)
  })
})

describe('buildSavedFlowViewLabel', () => {
  it('adds a compact datetime window to saved view labels', () => {
    expect(buildSavedFlowViewLabel({
      query: 'login',
      method: '',
      statusMin: '',
      statusMax: '',
      timeFrom: '2026-03-12T08:15',
      timeTo: '2026-03-12T09:45',
    })).toBe('03/12 08:15-09:45 · login')
  })
})

describe('loadSavedFlowViews', () => {
  it('keeps legacy saved views that do not yet have datetime fields', () => {
    localStorage.setItem('mcp_flow_saved_views', JSON.stringify([
      {
        id: 'legacy-1',
        label: 'Errors',
        filters: {
          query: '',
          method: '',
          statusMin: '500',
          statusMax: '599',
        },
      },
    ]))

    expect(loadSavedFlowViews()).toEqual([
      {
        id: 'legacy-1',
        label: 'Errors',
        filters: {
          query: '',
          method: '',
          statusMin: '500',
          statusMax: '599',
          timeFrom: '',
          timeTo: '',
        },
      },
    ])
  })
})
