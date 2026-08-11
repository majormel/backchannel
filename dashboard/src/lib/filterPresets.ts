import type { FlowSearchFilters } from './types'

export type FilterPreset = {
  id: string
  name: string
  filters: FlowSearchFilters
}

const FILTER_PRESETS_KEY = 'mcp_filter_presets'

function normalizePresetFilters(filters: FlowSearchFilters): FlowSearchFilters {
  return {
    query: filters.query.trim(),
    method: filters.method.trim().toUpperCase(),
    statusMin: filters.statusMin.trim(),
    statusMax: filters.statusMax.trim(),
    timeFrom: '',
    timeTo: '',
  }
}

export function loadFilterPresets(): FilterPreset[] {
  try {
    const stored = localStorage.getItem(FILTER_PRESETS_KEY)
    if (!stored) {
      return []
    }
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .filter((item): item is FilterPreset => {
        return Boolean(
          item &&
          typeof item.id === 'string' &&
          typeof item.name === 'string' &&
          item.filters &&
          typeof item.filters.query === 'string' &&
          typeof item.filters.method === 'string' &&
          typeof item.filters.statusMin === 'string' &&
          typeof item.filters.statusMax === 'string'
        )
      })
      .map((item) => ({
        ...item,
        filters: normalizePresetFilters({
          ...item.filters,
          timeFrom: '',
          timeTo: '',
        }),
      }))
  } catch {
    return []
  }
}

export function saveFilterPresets(presets: FilterPreset[]): void {
  try {
    localStorage.setItem(FILTER_PRESETS_KEY, JSON.stringify(presets))
  } catch {
  }
}

export function createFilterPreset(name: string, filters: FlowSearchFilters): FilterPreset {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim(),
    filters: normalizePresetFilters(filters),
  }
}

export function hasPresetCompatibleFilters(filters: FlowSearchFilters): boolean {
  return Boolean(filters.query.trim() || filters.method.trim() || filters.statusMin.trim() || filters.statusMax.trim())
}
