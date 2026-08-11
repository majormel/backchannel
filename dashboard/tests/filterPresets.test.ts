import { afterEach, describe, expect, it } from 'vitest'

import { createFilterPreset, hasPresetCompatibleFilters, loadFilterPresets, saveFilterPresets } from '../src/lib/filterPresets'
import type { FlowSearchFilters } from '../src/lib/types'

afterEach(() => {
  localStorage.clear()
})

const baseFilters: FlowSearchFilters = {
  query: '',
  method: '',
  statusMin: '',
  statusMax: '',
  timeFrom: '',
  timeTo: '',
}

describe('filter presets storage', () => {
  it('persists presets under mcp_filter_presets', () => {
    const preset = createFilterPreset('Errors', {
      ...baseFilters,
      method: 'get',
      statusMin: '400',
      statusMax: '599',
    })
    saveFilterPresets([preset])
    const loaded = loadFilterPresets()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].name).toBe('Errors')
    expect(loaded[0].filters.method).toBe('GET')
    expect(loaded[0].filters.statusMin).toBe('400')
    expect(loaded[0].filters.statusMax).toBe('599')
    expect(loaded[0].filters.timeFrom).toBe('')
    expect(loaded[0].filters.timeTo).toBe('')
  })

  it('returns an empty list for invalid stored data', () => {
    localStorage.setItem('mcp_filter_presets', JSON.stringify({ invalid: true }))
    expect(loadFilterPresets()).toEqual([])
  })
})

describe('hasPresetCompatibleFilters', () => {
  it('requires query, method, or status range', () => {
    expect(hasPresetCompatibleFilters(baseFilters)).toBe(false)
    expect(hasPresetCompatibleFilters({ ...baseFilters, query: 'api' })).toBe(true)
    expect(hasPresetCompatibleFilters({ ...baseFilters, method: 'POST' })).toBe(true)
    expect(hasPresetCompatibleFilters({ ...baseFilters, statusMin: '500' })).toBe(true)
  })
})
