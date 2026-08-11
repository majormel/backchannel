import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Filter, ChevronDown, BookmarkPlus, Pin, Save, Trash2 } from 'lucide-react'

import { createSavedFlowView, hasFlowSearchFilters, loadSavedFlowViews, saveSavedFlowViews, serializeFlowSearchFilters, type SavedFlowView } from '../lib/flowViews'
import { createFilterPreset, hasPresetCompatibleFilters, loadFilterPresets, saveFilterPresets, type FilterPreset } from '../lib/filterPresets'
import type { FlowSearchFilters } from '../lib/types'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

type FlowSearchProps = {
  onSearch: (filters: FlowSearchFilters) => void
  onClear: () => void
  initialFilters?: FlowSearchFilters | null
  resultCount?: number
  totalCount?: number
  isSearching?: boolean
  resetToken?: number
}

const methods = ['', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

const QUICK_FILTER_VIEWS: Array<{ id: string; label: string; filters: FlowSearchFilters }> = [
  { id: 'errors', label: 'Errors', filters: { query: '', method: '', statusMin: '400', statusMax: '599', timeFrom: '', timeTo: '' } },
  { id: '4xx', label: '4xx', filters: { query: '', method: '', statusMin: '400', statusMax: '499', timeFrom: '', timeTo: '' } },
  { id: '5xx', label: '5xx', filters: { query: '', method: '', statusMin: '500', statusMax: '599', timeFrom: '', timeTo: '' } },
  { id: 'get', label: 'GET', filters: { query: '', method: 'GET', statusMin: '', statusMax: '', timeFrom: '', timeTo: '' } },
  { id: 'post', label: 'POST', filters: { query: '', method: 'POST', statusMin: '', statusMax: '', timeFrom: '', timeTo: '' } },
]

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

const EMPTY_FILTERS: FlowSearchFilters = {
  query: '',
  method: '',
  statusMin: '',
  statusMax: '',
  timeFrom: '',
  timeTo: '',
}

export function FlowSearch({ onSearch, onClear, initialFilters, resultCount, totalCount, isSearching, resetToken = 0 }: FlowSearchProps) {
  const startingFilters = normalizeFilters(initialFilters ?? EMPTY_FILTERS)
  const [query, setQuery] = useState(startingFilters.query)
  const [method, setMethod] = useState(startingFilters.method)
  const [statusMin, setStatusMin] = useState(startingFilters.statusMin)
  const [statusMax, setStatusMax] = useState(startingFilters.statusMax)
  const [timeFrom, setTimeFrom] = useState(startingFilters.timeFrom)
  const [timeTo, setTimeTo] = useState(startingFilters.timeTo)
  const [showFilters, setShowFilters] = useState(Boolean(startingFilters.method || startingFilters.statusMin || startingFilters.statusMax || startingFilters.timeFrom || startingFilters.timeTo))
  const [appliedFilters, setAppliedFilters] = useState<FlowSearchFilters | null>(() => hasFlowSearchFilters(startingFilters) ? startingFilters : null)
  const [savedViews, setSavedViews] = useState<SavedFlowView[]>(() => loadSavedFlowViews())
  const [filterPresets, setFilterPresets] = useState<FilterPreset[]>(() => loadFilterPresets())
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const lastResetToken = useRef(resetToken)

  const currentFilters = normalizeFilters({ query, method, statusMin, statusMax, timeFrom, timeTo })
  const hasInput = hasFlowSearchFilters(currentFilters)
  const hasTimeRangeError = Boolean(currentFilters.timeFrom && currentFilters.timeTo && currentFilters.timeFrom > currentFilters.timeTo)
  const activeSignature = appliedFilters ? serializeFlowSearchFilters(appliedFilters) : null

  const setFilterState = useCallback((filters: FlowSearchFilters) => {
    setQuery(filters.query)
    setMethod(filters.method)
    setStatusMin(filters.statusMin)
    setStatusMax(filters.statusMax)
    setTimeFrom(filters.timeFrom)
    setTimeTo(filters.timeTo)
    setShowFilters(Boolean(filters.method || filters.statusMin || filters.statusMax || filters.timeFrom || filters.timeTo))
  }, [])

  const handleClear = useCallback(() => {
    setQuery('')
    setMethod('')
    setStatusMin('')
    setStatusMax('')
    setTimeFrom('')
    setTimeTo('')
    setShowFilters(false)
    setAppliedFilters(null)
    setSelectedPresetId('')
    onClear()
  }, [onClear])

  const applyFilters = useCallback((filters: FlowSearchFilters) => {
    const normalized = normalizeFilters(filters)
    setFilterState(normalized)

    if (!hasFlowSearchFilters(normalized)) {
      setAppliedFilters(null)
      onClear()
      return
    }

    setAppliedFilters(normalized)
    onSearch(normalized)
  }, [onClear, onSearch, setFilterState])

  const handleSearch = useCallback(() => {
    if (hasTimeRangeError) {
      return
    }
    applyFilters(currentFilters)
  }, [applyFilters, currentFilters, hasTimeRangeError])

  const handleSaveView = useCallback(() => {
    if (!hasInput || hasTimeRangeError) {
      return
    }

    const signature = serializeFlowSearchFilters(currentFilters)
    if (savedViews.some((view) => serializeFlowSearchFilters(view.filters) === signature)) {
      return
    }

    const nextView = createSavedFlowView(currentFilters, savedViews)
    const nextViews = [nextView, ...savedViews].slice(0, 8)
    setSavedViews(nextViews)
    saveSavedFlowViews(nextViews)
  }, [currentFilters, hasInput, hasTimeRangeError, savedViews])

  const handleRemoveSavedView = useCallback((viewId: string) => {
    const nextViews = savedViews.filter((view) => view.id !== viewId)
    setSavedViews(nextViews)
    saveSavedFlowViews(nextViews)
  }, [savedViews])

  const handleApplyView = useCallback((filters: FlowSearchFilters) => {
    const signature = serializeFlowSearchFilters(filters)
    if (activeSignature && activeSignature === signature) {
      handleClear()
      return
    }
    applyFilters(filters)
  }, [activeSignature, applyFilters, handleClear])

  const handleSelectPreset = useCallback((presetId: string) => {
    setSelectedPresetId(presetId)
    if (!presetId) {
      return
    }
    const selectedPreset = filterPresets.find((preset) => preset.id === presetId)
    if (!selectedPreset) {
      return
    }
    const presetFilters: FlowSearchFilters = {
      query: selectedPreset.filters.query,
      method: selectedPreset.filters.method,
      statusMin: selectedPreset.filters.statusMin,
      statusMax: selectedPreset.filters.statusMax,
      timeFrom: '',
      timeTo: '',
    }
    applyFilters(presetFilters)
  }, [applyFilters, filterPresets])

  const handleSaveCurrentPreset = useCallback(() => {
    const presetFilters: FlowSearchFilters = {
      query: query.trim(),
      method: method.trim().toUpperCase(),
      statusMin: statusMin.trim(),
      statusMax: statusMax.trim(),
      timeFrom: '',
      timeTo: '',
    }
    if (!hasPresetCompatibleFilters(presetFilters)) {
      return
    }

    const suggestedName = [
      presetFilters.method || '',
      presetFilters.statusMin || presetFilters.statusMax ? `Status ${presetFilters.statusMin || '*'}-${presetFilters.statusMax || '*'}` : '',
      presetFilters.query || '',
    ].filter(Boolean).join(' · ').slice(0, 48) || `Preset ${filterPresets.length + 1}`

    const enteredName = window.prompt('Preset name', suggestedName)
    if (!enteredName || !enteredName.trim()) {
      return
    }

    const normalizedName = enteredName.trim()
    const nextPreset = createFilterPreset(normalizedName, presetFilters)
    const withoutSameName = filterPresets.filter((preset) => preset.name.toLowerCase() !== normalizedName.toLowerCase())
    const nextPresets = [nextPreset, ...withoutSameName].slice(0, 20)
    setFilterPresets(nextPresets)
    saveFilterPresets(nextPresets)
    setSelectedPresetId(nextPreset.id)
  }, [filterPresets, method, query, statusMax, statusMin])

  const handleDeleteSelectedPreset = useCallback(() => {
    if (!selectedPresetId) {
      return
    }
    const nextPresets = filterPresets.filter((preset) => preset.id !== selectedPresetId)
    setFilterPresets(nextPresets)
    saveFilterPresets(nextPresets)
    setSelectedPresetId('')
  }, [filterPresets, selectedPresetId])

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleSearch()
    }
  }

  useEffect(() => {
    if (!method && !statusMin && !statusMax && !timeFrom && !timeTo) {
      const timer = setTimeout(() => {
        const normalized = normalizeFilters({ query, method, statusMin, statusMax, timeFrom, timeTo })
        if (normalized.query) {
          if (serializeFlowSearchFilters(normalized) === activeSignature) {
            return
          }
          setAppliedFilters(normalized)
          onSearch(normalized)
        } else if (appliedFilters?.query && !appliedFilters.method && !appliedFilters.statusMin && !appliedFilters.statusMax && !appliedFilters.timeFrom && !appliedFilters.timeTo) {
          setAppliedFilters(null)
          onClear()
        }
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [activeSignature, appliedFilters, method, onClear, onSearch, query, statusMax, statusMin, timeFrom, timeTo])

  useEffect(() => {
    if (lastResetToken.current === resetToken) {
      return
    }
    lastResetToken.current = resetToken
    setQuery('')
    setMethod('')
    setStatusMin('')
    setStatusMax('')
    setTimeFrom('')
    setTimeTo('')
    setShowFilters(false)
    setAppliedFilters(null)
    setSelectedPresetId('')
  }, [resetToken])

  const renderViewChip = (label: string, filters: FlowSearchFilters, removable?: { id: string }) => {
    const signature = serializeFlowSearchFilters(filters)
    const isActive = activeSignature === signature

    const chipClassName = `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
      isActive
        ? 'border-accent/30 bg-accent/12 text-accent'
        : 'border-hairline bg-white/[0.03] text-foreground/78 hover:bg-white/[0.06]'
    }`

    if (!removable) {
      return (
        <button
          key={label}
          type="button"
          onClick={() => handleApplyView(filters)}
          className={chipClassName}
        >
          <span>{label}</span>
        </button>
      )
    }

    return (
      <div key={removable.id} className={`${chipClassName} pr-1`}>
        <button
          type="button"
          onClick={() => handleApplyView(filters)}
          className="min-w-0"
        >
          <span className="truncate">{label}</span>
        </button>
        <button
          type="button"
          onClick={() => handleRemoveSavedView(removable.id)}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          aria-label={`Remove saved view ${label}`}
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="flow-search-query"
            aria-label="Search recent flows"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search recent flows by URL, method, headers, or body…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            className="h-11 rounded-md border-hairline bg-white/[0.05] pl-10 pr-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="relative min-w-[190px]">
          <select
            value={selectedPresetId}
            onChange={(event) => handleSelectPreset(event.target.value)}
            className="h-11 w-full cursor-pointer appearance-none rounded-md border border-hairline bg-white/[0.05] px-3 pr-8 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Filter presets"
          >
            <option value="">Filter presets</option>
            {filterPresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSaveCurrentPreset}
          disabled={!hasPresetCompatibleFilters({ query, method, statusMin, statusMax, timeFrom: '', timeTo: '' })}
          className="h-11 rounded-md px-3"
        >
          <Save className="mr-1.5 h-3.5 w-3.5" />
          Save current filter
        </Button>
        {selectedPresetId ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDeleteSelectedPreset}
            className="h-11 rounded-md px-3 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
            aria-label="Delete selected preset"
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete preset
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="icon"
          onClick={() => setShowFilters(!showFilters)}
          aria-label="Toggle advanced filters"
          aria-expanded={showFilters}
          className={`relative h-11 w-11 rounded-md transition-[background-color,border-color,color] ${showFilters ? 'border-accent/30 bg-accent/12 text-accent' : ''}`}
        >
          <Filter className="h-4 w-4" />
          {(method || statusMin || statusMax || timeFrom || timeTo) ? (
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-accent" />
          ) : null}
        </Button>
        <AnimatePresence>
          {hasInput ? (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClear}
                className="h-11 w-11 rounded-md text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                aria-label="Reset search filters"
              >
                <X className="h-4 w-4" />
              </Button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-hairline bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <Pin className="h-3.5 w-3.5" />
          Quick views
        </div>
        {QUICK_FILTER_VIEWS.map((view) => renderViewChip(view.label, view.filters))}
        {hasInput ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSaveView}
            className="h-8 rounded-full px-3 text-xs text-foreground/78 hover:bg-white/[0.06] hover:text-foreground"
          >
            <BookmarkPlus className="mr-1.5 h-3.5 w-3.5" />
            Save view
          </Button>
        ) : null}
      </div>

      {savedViews.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-hairline bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <BookmarkPlus className="h-3.5 w-3.5" />
            Saved
          </div>
          {savedViews.map((view) => renderViewChip(view.label, view.filters, { id: view.id }))}
        </div>
      ) : null}

      <AnimatePresence>
        {showFilters ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-4 rounded-xl border border-hairline bg-white/[0.04] p-4">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_auto]">
                <div className="space-y-2 rounded-lg border border-hairline bg-black/10 p-3">
                  <Label htmlFor="flow-time-from" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Captured After</Label>
                  <Input
                    id="flow-time-from"
                    name="flow-time-from"
                    type="datetime-local"
                    autoComplete="off"
                    value={timeFrom}
                    max={timeTo || undefined}
                    onChange={(event) => setTimeFrom(event.target.value)}
                    className="h-10 rounded-md border-hairline bg-white/[0.05]"
                  />
                </div>

                <div className="space-y-2 rounded-lg border border-hairline bg-black/10 p-3">
                  <Label htmlFor="flow-time-to" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Captured Before</Label>
                  <Input
                    id="flow-time-to"
                    name="flow-time-to"
                    type="datetime-local"
                    autoComplete="off"
                    value={timeTo}
                    min={timeFrom || undefined}
                    onChange={(event) => setTimeTo(event.target.value)}
                    className="h-10 rounded-md border-hairline bg-white/[0.05]"
                  />
                </div>

                <div className="flex items-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSearch}
                    disabled={isSearching || hasTimeRangeError}
                    className="h-10 w-full rounded-md xl:w-auto"
                  >
                    {isSearching ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="h-4 w-4 rounded-full border-2 border-current border-t-transparent"
                      />
                    ) : (
                      'Apply Filters'
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Label htmlFor="flow-method" className="text-xs font-medium uppercase text-muted-foreground">Method</Label>
                <div className="relative">
                  <select
                    id="flow-method"
                    name="flow-method"
                    autoComplete="off"
                    value={method}
                    onChange={(event) => setMethod(event.target.value)}
                    className="h-10 min-w-[110px] cursor-pointer appearance-none rounded-md border border-hairline bg-white/[0.05] px-3 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {methods.map((value) => (
                      <option key={value} value={value}>
                        {value || 'Any'}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Label htmlFor="flow-status-min" className="text-xs font-medium uppercase text-muted-foreground">Status Min</Label>
                <Input
                  id="flow-status-min"
                  name="flow-status-min"
                  type="number"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="200"
                  value={statusMin}
                  onChange={(event) => setStatusMin(event.target.value)}
                  className="h-10 w-24 rounded-md border-hairline bg-white/[0.05]"
                />
              </div>

              <div className="flex items-center gap-2">
                <Label htmlFor="flow-status-max" className="text-xs font-medium uppercase text-muted-foreground">Status Max</Label>
                <Input
                  id="flow-status-max"
                  name="flow-status-max"
                  type="number"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="599"
                  value={statusMax}
                  onChange={(event) => setStatusMax(event.target.value)}
                  className="h-10 w-24 rounded-md border-hairline bg-white/[0.05]"
                />
              </div>

              {hasTimeRangeError ? (
                <div className="text-sm text-amber-100">Choose an end time that comes after the start time.</div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {appliedFilters && typeof resultCount === 'number' && typeof totalCount === 'number' ? (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-2 text-xs"
        >
          <span className="text-muted-foreground">Showing</span>
          <span className="font-medium text-accent">{resultCount}</span>
          <span className="text-muted-foreground">of</span>
          <span className="font-medium">{totalCount}</span>
          <span className="text-muted-foreground">recent flows</span>
          {resultCount < totalCount ? (
            <span className="text-xs text-muted-foreground">(filtered)</span>
          ) : null}
        </motion.div>
      ) : null}
    </div>
  )
}
