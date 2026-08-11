import type { FlowSearchFilters } from './types'

export type SavedFlowView = {
  id: string
  label: string
  filters: FlowSearchFilters
}

const SAVED_FLOW_VIEWS_KEY = 'mcp_flow_saved_views'

function normalizeFilters(filters: FlowSearchFilters): FlowSearchFilters {
  return {
    query: filters.query.trim(),
    method: filters.method.trim().toUpperCase(),
    statusMin: filters.statusMin.trim(),
    statusMax: filters.statusMax.trim(),
    timeFrom: filters.timeFrom.trim(),
    timeTo: filters.timeTo.trim(),
  }
}

function buildStatusLabel(statusMin: string, statusMax: string): string {
  if (statusMin && statusMax) {
    return `${statusMin}-${statusMax}`
  }
  if (statusMin) {
    return `${statusMin}+`
  }
  if (statusMax) {
    return `<=${statusMax}`
  }
  return ''
}

function formatDateTimeLabel(value: string): string {
  const [datePart = '', timePart = ''] = value.split('T')
  if (!datePart) {
    return value
  }
  const [, month = '', day = ''] = datePart.split('-')
  const shortDate = month && day ? `${month}/${day}` : datePart
  return timePart ? `${shortDate} ${timePart.slice(0, 5)}` : shortDate
}

function buildTimeLabel(timeFrom: string, timeTo: string): string {
  if (timeFrom && timeTo) {
    const fromLabel = formatDateTimeLabel(timeFrom)
    const toLabel = formatDateTimeLabel(timeTo)
    const [fromDate = '', fromTime = ''] = fromLabel.split(' ')
    const [toDate = '', toTime = ''] = toLabel.split(' ')

    if (fromDate && fromDate === toDate && fromTime && toTime) {
      return `${fromDate} ${fromTime}-${toTime}`
    }
    return `${fromLabel} to ${toLabel}`
  }
  if (timeFrom) {
    return `After ${formatDateTimeLabel(timeFrom)}`
  }
  if (timeTo) {
    return `Before ${formatDateTimeLabel(timeTo)}`
  }
  return ''
}

function getUniqueLabel(label: string, views: SavedFlowView[]): string {
  const taken = new Set(views.map((view) => view.label))
  if (!taken.has(label)) {
    return label
  }

  let suffix = 2
  while (taken.has(`${label} ${suffix}`)) {
    suffix += 1
  }
  return `${label} ${suffix}`
}

export function serializeFlowSearchFilters(filters: FlowSearchFilters): string {
  const normalized = normalizeFilters(filters)
  return JSON.stringify([normalized.query, normalized.method, normalized.statusMin, normalized.statusMax, normalized.timeFrom, normalized.timeTo])
}

export function hasFlowSearchFilters(filters: FlowSearchFilters): boolean {
  const normalized = normalizeFilters(filters)
  return Boolean(normalized.query || normalized.method || normalized.statusMin || normalized.statusMax || normalized.timeFrom || normalized.timeTo)
}

export function buildSavedFlowViewLabel(filters: FlowSearchFilters): string {
  const normalized = normalizeFilters(filters)
  const parts: string[] = []

  if (normalized.method) {
    parts.push(normalized.method)
  }

  const statusLabel = buildStatusLabel(normalized.statusMin, normalized.statusMax)
  if (statusLabel) {
    parts.push(`Status ${statusLabel}`)
  }

  const timeLabel = buildTimeLabel(normalized.timeFrom, normalized.timeTo)
  if (timeLabel) {
    parts.push(timeLabel)
  }

  if (normalized.query) {
    parts.push(normalized.query)
  }

  return (parts.join(' · ') || 'Saved view').slice(0, 48)
}

export function loadSavedFlowViews(): SavedFlowView[] {
  try {
    const stored = localStorage.getItem(SAVED_FLOW_VIEWS_KEY)
    if (!stored) {
      return []
    }

    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .filter((view): view is SavedFlowView => {
        return Boolean(
          view &&
          typeof view.id === 'string' &&
          typeof view.label === 'string' &&
          view.filters &&
          typeof view.filters.query === 'string' &&
          typeof view.filters.method === 'string' &&
          typeof view.filters.statusMin === 'string' &&
          typeof view.filters.statusMax === 'string' &&
          (typeof view.filters.timeFrom === 'string' || typeof view.filters.timeFrom === 'undefined') &&
          (typeof view.filters.timeTo === 'string' || typeof view.filters.timeTo === 'undefined')
        )
      })
      .map((view) => ({
        ...view,
        filters: normalizeFilters({
          ...view.filters,
          timeFrom: view.filters.timeFrom ?? '',
          timeTo: view.filters.timeTo ?? '',
        }),
      }))
  } catch {
    return []
  }
}

export function saveSavedFlowViews(views: SavedFlowView[]): void {
  try {
    localStorage.setItem(SAVED_FLOW_VIEWS_KEY, JSON.stringify(views))
  } catch {
  }
}

export function createSavedFlowView(filters: FlowSearchFilters, existingViews: SavedFlowView[]): SavedFlowView {
  const normalized = normalizeFilters(filters)
  const label = getUniqueLabel(buildSavedFlowViewLabel(normalized), existingViews)

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    filters: normalized,
  }
}
