import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Activity, Keyboard, Radio } from '@/components/ui/icons'
import type { SortingState } from '@tanstack/react-table'

import { BookmarksPanel } from './components/BookmarksPanel'
import { CodexReviewPanel } from './components/CodexReviewPanel'
import { ConnectionDialog, ConnectionLaunchpad, ConnectionSettingsCard } from './components/ConnectionExperience'
import { FridaPanel } from './components/FridaPanel'
import { CommandDeck } from './components/CommandDeck'
import { ExportModal } from './components/ExportModal'
import { FlowCompareModal } from './components/FlowCompareModal'
import { FlowInspector } from './components/inspector/FlowInspector'
import { FlowTable } from './components/FlowTable'
import FlowInspectModal from './components/FlowInspectModal'
import { FlowSearch } from './components/FlowSearch'
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal'
import { MetricsRow } from './components/metrics/MetricsRow'
import ReplayRequestModal from './components/ReplayRequestModal'
import { SequenceDiagramModal } from './components/SequenceDiagramModal'
import { BrandMark } from './components/layout/BrandMark'
import { CommandBar } from './components/layout/CommandBar'
import { NavRail } from './components/layout/NavRail'
import { WorkspaceHeading } from './components/layout/WorkspaceHeading'
import { Button } from './components/ui/button'
import { useAutoRefresh } from './hooks/useAutoRefresh'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useWebSocket } from './hooks/useWebSocket'
import { getFlow, getFlows, getStatus, startProxy, stopProxy, clearFlows, killProcess } from './lib/api'
import { loadToken, saveToken } from './lib/auth'
import { loadBookmarks, saveBookmarks, toggleBookmark } from './lib/bookmarks'
import { matchesProtocol } from './lib/flowStats'
import { listenHostForSource, loadSetupComplete, saveSetupComplete, shouldShowLaunchpad, type ConnectionSource } from './lib/setup'
import type { DashboardView, Flow, FlowSearchFilters, FlowSummary, FlowsSearchParams, MitmStatus, ProtocolFilter } from './lib/types'
import { cn } from './lib/utils'

function App() {
  const prefersReducedMotion = useReducedMotion()
  const [token, setToken] = useState(() => loadToken() || '')
  const [status, setStatus] = useState<MitmStatus>({ running: false, capture_path: '' })
  const [flows, setFlows] = useState<FlowSummary[]>([])
  const [selectedFlowSummary, setSelectedFlowSummary] = useState<FlowSummary | null>(null)
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null)
  const [selectedFlowLoading, setSelectedFlowLoading] = useState(false)
  const [message, setMessage] = useState('Ready')
  const [listenHost, setListenHost] = useState('127.0.0.1')
  const [listenPort, setListenPort] = useState(8080)
  const [mode, setMode] = useState('regular')
  const [capturePath, setCapturePath] = useState('')
  const [maxBodyBytes, setMaxBodyBytes] = useState(0)
  const [filterCount] = useState(50)
  const [filterDecodeProto, setFilterDecodeProto] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [refreshInterval, setRefreshInterval] = useState(4)
  const [connectedClients, setConnectedClients] = useState<string[]>([])
  const [lastActivity, setLastActivity] = useState<number | null>(null)
  const [killingPid, setKillingPid] = useState<number | null>(null)
  const [replayOpen, setReplayOpen] = useState(false)
  const [replaySeed, setReplaySeed] = useState<Flow | null>(null)
  const [isLoadingFlows, setIsLoadingFlows] = useState(false)
  const [totalFlows, setTotalFlows] = useState(0)
  const [selectedFlowsForCompare, setSelectedFlowsForCompare] = useState<FlowSummary[]>([])
  const [selectedFlowsForExport, setSelectedFlowsForExport] = useState<FlowSummary[]>([])
  const [compareModalOpen, setCompareModalOpen] = useState(false)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false)
  const [sequenceModalOpen, setSequenceModalOpen] = useState(false)
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>(() => loadBookmarks())
  const [bookmarksPanelOpen, setBookmarksPanelOpen] = useState(false)
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false)
  const [connectionOpen, setConnectionOpen] = useState(false)
  const [connectionSource, setConnectionSource] = useState<ConnectionSource | null>(null)
  const [setupComplete, setSetupComplete] = useState(() => loadSetupComplete())
  const [initialLoadComplete, setInitialLoadComplete] = useState(false)
  const [searchResetToken, setSearchResetToken] = useState(0)
  const [activeSearchFilters, setActiveSearchFilters] = useState<FlowSearchFilters | null>(null)
  const [isCompactLayout, setIsCompactLayout] = useState(false)
  const [view, setView] = useState<DashboardView>('capture')
  const [protocolFilter, setProtocolFilter] = useState<ProtocolFilter>('all')
  const [sorting, setSorting] = useState<SortingState>([])
  const flowsTableRef = useRef<HTMLDivElement>(null)
  const flowRequestRef = useRef<AbortController | null>(null)
  const detailRequestRef = useRef<AbortController | null>(null)
  const activeFlowIndexRef = useRef<number | null>(null)
  const selectedFlowSummaryRef = useRef<FlowSummary | null>(null)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1279px)')
    const update = () => {
      setIsCompactLayout(media.matches)
    }
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark')
  }, [])

  useEffect(() => {
    return () => {
      flowRequestRef.current?.abort()
      detailRequestRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    selectedFlowSummaryRef.current = selectedFlowSummary
  }, [selectedFlowSummary])

  const handleTokenChange = (value: string) => {
    setToken(value)
    saveToken(value)
  }

  const copyToClipboard = async (value: string) => {
    if (!value) return
    try {
      await navigator.clipboard?.writeText(value)
      setMessage('Copied to clipboard')
    } catch {
      setMessage('Copy failed. Select the value and copy it manually.')
    }
  }

  const applyActivitySnapshot = useCallback((flowItems: FlowSummary[]) => {
    if (flowItems.length === 0) {
      setConnectedClients([])
      setLastActivity(null)
      return
    }

    const now = Date.now()
    const recentFlows = flowItems.filter((flow) => (now - flow.ts * 1000) < 30000)
    const clients = new Set<string>()
    recentFlows.forEach((flow) => {
      if (flow.client?.[0]) {
        clients.add(flow.client[0])
      }
    })

    setConnectedClients(Array.from(clients))
    setLastActivity(flowItems[flowItems.length - 1]?.ts || null)
  }, [])

  const syncSelectionsWithFlows = useCallback((nextFlows: FlowSummary[]) => {
    const flowMap = new Map(nextFlows.map((flow) => [flow.id, flow]))
    setSelectedFlowsForExport((prev) => prev.map((flow) => flowMap.get(flow.id)).filter((flow): flow is FlowSummary => !!flow))
    setSelectedFlowsForCompare((prev) => prev.map((flow) => flowMap.get(flow.id)).filter((flow): flow is FlowSummary => !!flow))
    setSelectedFlowSummary((prev) => (prev ? flowMap.get(prev.id) ?? prev : null))
  }, [])

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getStatus(token || null)
      setStatus(data)
      if (data.listen_host) setListenHost(data.listen_host)
      if (data.listen_port) setListenPort(data.listen_port)
      if (data.mode) setMode(data.mode)
      if (data.capture_path) setCapturePath(data.capture_path)
      if (data.max_body_bytes !== undefined && data.max_body_bytes !== null) setMaxBodyBytes(data.max_body_bytes)
      setMessage('Ready')
    } catch (err) {
      setMessage((err as Error).message)
    }
  }, [token])

  const runFlowQuery = useCallback(async (params: FlowsSearchParams, successLabel: string) => {
    flowRequestRef.current?.abort()
    const controller = new AbortController()
    flowRequestRef.current = controller
    setIsLoadingFlows(true)

    try {
      const data = await getFlows({ ...params, summary: true }, token || null, controller.signal)
      if (flowRequestRef.current !== controller) {
        return
      }
      setFlows(data.flows)
      setTotalFlows(data.count)
      syncSelectionsWithFlows(data.flows)
      applyActivitySnapshot(data.flows)
      setMessage(successLabel.replace('{count}', String(data.count)))
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }
      setMessage((err as Error).message)
    } finally {
      if (flowRequestRef.current === controller) {
        setIsLoadingFlows(false)
      }
    }
  }, [applyActivitySnapshot, syncSelectionsWithFlows, token])

  const buildSearchParams = useCallback((filters: FlowSearchFilters | null): FlowsSearchParams => {
    const params: FlowsSearchParams = {
      n: filterCount,
      decode_proto: filterDecodeProto,
    }
    const parseDateTimeValue = (value: string) => {
      const parsed = Date.parse(value)
      if (Number.isNaN(parsed)) {
        return undefined
      }
      return Math.floor(parsed / 1000)
    }

    if (filters?.query) params.query = filters.query
    if (filters?.method) params.method = filters.method
    if (filters?.statusMin) params.status_min = Number(filters.statusMin)
    if (filters?.statusMax) params.status_max = Number(filters.statusMax)
    if (filters?.timeFrom) {
      const parsed = parseDateTimeValue(filters.timeFrom)
      if (parsed !== undefined) params.time_from = parsed
    }
    if (filters?.timeTo) {
      const parsed = parseDateTimeValue(filters.timeTo)
      if (parsed !== undefined) params.time_to = parsed
    }
    return params
  }, [filterCount, filterDecodeProto])

  const handleTail = useCallback(async () => {
    setActiveSearchFilters(null)
    setSearchResetToken((value) => value + 1)
    await runFlowQuery(buildSearchParams(null), 'Loaded {count} recent flows')
  }, [buildSearchParams, runFlowQuery])

  const handleSearch = useCallback(async (filters: FlowSearchFilters) => {
    setActiveSearchFilters(filters)
    await runFlowQuery(buildSearchParams(filters), 'Found {count} recent flows')
  }, [buildSearchParams, runFlowQuery])

  const handleClearSearch = useCallback(async () => {
    setActiveSearchFilters(null)
    await runFlowQuery(buildSearchParams(null), 'Loaded {count} recent flows')
  }, [buildSearchParams, runFlowQuery])

  const refreshActiveFlows = useCallback(() => {
    const filters = activeSearchFilters && (activeSearchFilters.query || activeSearchFilters.method || activeSearchFilters.statusMin || activeSearchFilters.statusMax || activeSearchFilters.timeFrom || activeSearchFilters.timeTo)
      ? activeSearchFilters
      : null
    void runFlowQuery(buildSearchParams(filters), filters ? 'Updated {count} recent matches' : 'Loaded {count} recent flows')
  }, [activeSearchFilters, buildSearchParams, runFlowQuery])

  const handleIncomingFlow = useCallback((incoming: FlowSummary) => {
    setFlows((previous) => {
      const withoutDuplicate = previous.filter((flow) => flow.id !== incoming.id)
      const next = [...withoutDuplicate, incoming]
      const trimmed = next.slice(-Math.max(1, filterCount))
      syncSelectionsWithFlows(trimmed)
      applyActivitySnapshot(trimmed)
      setTotalFlows(trimmed.length)
      return trimmed
    })
  }, [applyActivitySnapshot, filterCount, syncSelectionsWithFlows])

  const webSocketFilters = useMemo(() => {
    const filters: {
      url_contains?: string
      method?: string
      status_min?: number
      status_max?: number
    } = {}
    const normalizedQuery = activeSearchFilters?.query?.trim()
    if (normalizedQuery) {
      filters.url_contains = normalizedQuery
    }
    const normalizedMethod = activeSearchFilters?.method?.trim().toUpperCase()
    if (normalizedMethod) {
      filters.method = normalizedMethod
    }
    if (activeSearchFilters?.statusMin) {
      filters.status_min = Number(activeSearchFilters.statusMin)
    }
    if (activeSearchFilters?.statusMax) {
      filters.status_max = Number(activeSearchFilters.statusMax)
    }
    return filters
  }, [activeSearchFilters])

  const { connectionState: wsConnectionState, fallbackToPolling } = useWebSocket({
    token,
    filters: webSocketFilters,
    onFlow: handleIncomingFlow,
  })

  const closeInspector = useCallback(() => {
    detailRequestRef.current?.abort()
    setSelectedFlowSummary(null)
    setSelectedFlow(null)
    setSelectedFlowLoading(false)
  }, [])

  const openFlow = useCallback(async (flow: FlowSummary) => {
    detailRequestRef.current?.abort()
    const controller = new AbortController()
    detailRequestRef.current = controller

    setSelectedFlowSummary(flow)
    setSelectedFlow(null)
    setSelectedFlowLoading(true)

    try {
      const detail = await getFlow(flow.id, token || null, controller.signal, filterDecodeProto)
      if (detailRequestRef.current !== controller) {
        return
      }
      setSelectedFlow(detail)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }
      setMessage((err as Error).message)
    } finally {
      if (detailRequestRef.current === controller) {
        setSelectedFlowLoading(false)
      }
    }
  }, [filterDecodeProto, token])

  useEffect(() => {
    const selected = selectedFlowSummaryRef.current
    if (!selected) {
      return
    }
    void openFlow(selected)
  }, [filterDecodeProto, openFlow])

  const startCaptureAtHost = useCallback(async (nextListenHost: string) => {
    setListenHost(nextListenHost)
    const data = await startProxy(
      {
        listen_host: nextListenHost,
        listen_port: listenPort || 8080,
        mode: mode || 'regular',
        capture_path: capturePath || null,
        max_body_bytes: Number.isFinite(maxBodyBytes) ? maxBodyBytes : 0,
      },
      token || null
    )
    setStatus(data)
    if (data.error) {
      setMessage(data.error)
      throw new Error(data.error)
    }
    if (data.listen_port) setListenPort(data.listen_port)
    const cleanedCount = data.cleaned_orphans?.length || 0
    setMessage(cleanedCount > 0 ? `Started after cleaning ${cleanedCount} orphan process${cleanedCount === 1 ? '' : 'es'}` : 'Started')
    return data
  }, [capturePath, listenPort, maxBodyBytes, mode, token])

  const handleStart = useCallback(async () => {
    try {
      await startCaptureAtHost(listenHost || '127.0.0.1')
    } catch (err) {
      setMessage((err as Error).message)
    }
  }, [listenHost, startCaptureAtHost])

  const handlePrepareConnection = useCallback((source: ConnectionSource) => {
    return startCaptureAtHost(listenHostForSource(source))
  }, [startCaptureAtHost])

  const handleStop = async () => {
    try {
      const data = await stopProxy(token || null)
      setStatus((current) => ({ ...current, running: data.running }))
      setMessage('Stopped')
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  const handleClear = async () => {
    if ((totalFlows || flows.length) > 0 && !window.confirm('Clear all captured flows? This cannot be undone.')) {
      return
    }
    try {
      await clearFlows(token || null)
      flowRequestRef.current?.abort()
      closeInspector()
      setFlows([])
      setSelectedFlowsForCompare([])
      setSelectedFlowsForExport([])
      setTotalFlows(0)
      setConnectedClients([])
      setLastActivity(null)
      setMessage('Cleared')
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  const handleKillProcess = async (pid: number) => {
    try {
      setKillingPid(pid)
      const result = await killProcess(pid, token || null)
      setMessage(result.error || `Killed process ${pid}`)
      await fetchStatus()
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setKillingPid(null)
    }
  }

  const handleReplayRequest = (flow: Flow) => {
    setReplaySeed(flow)
    setReplayOpen(true)
    if (isCompactLayout) {
      closeInspector()
    }
  }

  const handleToggleBookmark = useCallback((flowId: string) => {
    const isNowBookmarked = toggleBookmark(flowId)
    setBookmarkedIds((prev) => {
      if (isNowBookmarked) return [...prev, flowId]
      return prev.filter((id) => id !== flowId)
    })
    setMessage(isNowBookmarked ? 'Flow bookmarked' : 'Bookmark removed')
  }, [])

  const handleClearAllBookmarks = useCallback(() => {
    saveBookmarks([])
    setBookmarkedIds([])
    setMessage('All bookmarks cleared')
  }, [])

  const handleToggleBookmarkForSelected = useCallback(() => {
    if (selectedFlowSummary) {
      handleToggleBookmark(selectedFlowSummary.id)
    }
  }, [handleToggleBookmark, selectedFlowSummary])

  const displayedFlows = useMemo(() => {
    let result = showBookmarksOnly ? flows.filter((flow) => bookmarkedIds.includes(flow.id)) : flows
    if (protocolFilter !== 'all') {
      result = result.filter((flow) => matchesProtocol(flow.request?.url || '', protocolFilter))
    }
    return result
  }, [bookmarkedIds, flows, showBookmarksOnly, protocolFilter])

  const exportIdSet = useMemo(() => new Set(selectedFlowsForExport.map((flow) => flow.id)), [selectedFlowsForExport])
  const bookmarkedIdSet = useMemo(() => new Set(bookmarkedIds), [bookmarkedIds])

  const isInspectorModalOpen = isCompactLayout && !!selectedFlowSummary

  useEffect(() => {
    let active = true
    const loadInitialState = async () => {
      await Promise.allSettled([
        fetchStatus(),
        runFlowQuery(buildSearchParams(null), 'Loaded {count} recent flows'),
      ])
      if (active) setInitialLoadComplete(true)
    }
    void loadInitialState()
    return () => {
      active = false
    }
  }, [buildSearchParams, fetchStatus, runFlowQuery])

  const completeSetup = useCallback(() => {
    saveSetupComplete(true)
    setSetupComplete(true)
  }, [])

  useEffect(() => {
    if (initialLoadComplete && !setupComplete && (status.running || totalFlows > 0)) {
      completeSetup()
    }
  }, [completeSetup, initialLoadComplete, setupComplete, status.running, totalFlows])

  const openConnections = useCallback((source: ConnectionSource | null = null) => {
    setConnectionSource(source)
    setConnectionOpen(true)
  }, [])

  useAutoRefresh(autoRefresh && fallbackToPolling && wsConnectionState !== 'connected', refreshInterval, refreshActiveFlows)

  useEffect(() => {
    if (fallbackToPolling) {
      setMessage('WebSocket unavailable, using polling fallback')
    }
  }, [fallbackToPolling])

  const handleFocusSearch = () => {
    const inputName = view === 'search' ? 'flow-search-query' : 'flow-search'
    const searchInput = document.querySelector(`input[name="${inputName}"]`) as HTMLInputElement | null
    searchInput?.focus()
  }

  const handleNavigateDown = () => {
    if (!flowsTableRef.current) return
    const rows = flowsTableRef.current.querySelectorAll('tbody tr')
    const activeIndex = activeFlowIndexRef.current
    if (activeIndex !== null && rows[activeIndex]) {
      rows[activeIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }

  const handleNavigateUp = () => {
    if (!flowsTableRef.current) return
    const rows = flowsTableRef.current.querySelectorAll('tbody tr')
    const activeIndex = activeFlowIndexRef.current
    if (activeIndex !== null && rows[activeIndex]) {
      rows[activeIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }

  const handleOpenSelected = () => {
    const activeIndex = activeFlowIndexRef.current
    if (activeIndex !== null && displayedFlows[activeIndex]) {
      void openFlow(displayedFlows[activeIndex])
    }
  }

  const handleCloseModal = () => {
    if (connectionOpen) {
      setConnectionOpen(false)
      return
    }
    if (isInspectorModalOpen || selectedFlowSummary) {
      closeInspector()
      return
    }
    if (replayOpen) {
      setReplayOpen(false)
      setReplaySeed(null)
      return
    }
    if (compareModalOpen) {
      setCompareModalOpen(false)
      setSelectedFlowsForCompare([])
      return
    }
    if (exportModalOpen) {
      setExportModalOpen(false)
      return
    }
    if (shortcutsModalOpen) {
      setShortcutsModalOpen(false)
      return
    }
    if (sequenceModalOpen) {
      setSequenceModalOpen(false)
      return
    }
    if (bookmarksPanelOpen) {
      setBookmarksPanelOpen(false)
    }
  }

  const keyboardShortcuts = useKeyboardShortcuts({
    onShowHelp: () => setShortcutsModalOpen(true),
    onRefresh: refreshActiveFlows,
    onFocusSearch: handleFocusSearch,
    onStartProxy: handleStart,
    onStopProxy: handleStop,
    onClearFlows: handleClear,
    onCloseModal: handleCloseModal,
    onNavigateDown: handleNavigateDown,
    onNavigateUp: handleNavigateUp,
    onOpenSelected: handleOpenSelected,
    onToggleBookmark: handleToggleBookmarkForSelected,
    onOpenBookmarks: () => setBookmarksPanelOpen(true),
    onToggleFrida: () => setView('frida'),
    isModalOpen: connectionOpen || isInspectorModalOpen || replayOpen || compareModalOpen || exportModalOpen || shortcutsModalOpen || sequenceModalOpen || bookmarksPanelOpen,
    flowsLength: displayedFlows.length,
  })

  useEffect(() => {
    activeFlowIndexRef.current = keyboardShortcuts.activeFlowIndex
  }, [keyboardShortcuts.activeFlowIndex])

  const isActiveTraffic = lastActivity ? (Date.now() - lastActivity * 1000) < 15000 : false
  const wsStatusLabel = wsConnectionState === 'connected'
    ? 'Live stream'
    : wsConnectionState === 'reconnecting'
      ? 'Reconnecting'
      : fallbackToPolling
        ? 'Polling fallback'
        : 'Disconnected'
  const activeSearchQuery = activeSearchFilters?.query?.trim() || ''
  const activityLabel = (() => {
    if (!status.running) return 'Proxy stopped'
    if (isActiveTraffic) return 'Traffic active'
    if (lastActivity) {
      return `Last activity ${Math.floor((Date.now() - lastActivity * 1000) / 1000)}s ago`
    }
    return 'Waiting for traffic'
  })()

  const handleToggleSelection = (flow: FlowSummary, checked: boolean) => {
    if (checked) {
      setSelectedFlowsForExport((prev) => [...prev, flow])
      setSelectedFlowsForCompare((prev) => {
        const next = prev.filter((item) => item.id !== flow.id)
        if (next.length < 2) return [...next, flow]
        return [next[1], flow]
      })
      return
    }

    setSelectedFlowsForExport((prev) => prev.filter((item) => item.id !== flow.id))
    setSelectedFlowsForCompare((prev) => prev.filter((item) => item.id !== flow.id))
  }

  const handleGlobalSearch = (value: string) => {
    const query = value.trim()
    const filters = { query, method: '', statusMin: '', statusMax: '', timeFrom: '', timeTo: '' }
    setView('search')
    if (query) {
      void handleSearch(filters)
    } else {
      void handleClearSearch()
    }
  }

  const launchpadVisible = shouldShowLaunchpad({
    initialLoadComplete,
    setupComplete,
    proxyRunning: status.running,
    totalFlows,
  })
  const showInspector = (view === 'capture' || view === 'flows' || view === 'search') && !launchpadVisible && initialLoadComplete
  const viewTitle = {
    capture: 'Capture',
    flows: 'Flows',
    search: 'Search',
    compare: 'Compare',
    sequence: 'Sequence',
    replay: 'Replay',
    agents: 'Agents',
    frida: 'Frida',
    settings: 'Settings',
  }[view]
  const captureControls = (
    <div className="capture-toolbar flex shrink-0 flex-wrap items-center gap-2 border-b border-white/[0.07] px-4 py-3">
      <div role="group" aria-label="Filter flows by protocol" className="inline-flex overflow-hidden rounded-lg border border-white/[0.08] bg-black/10">
        {(['all', 'http', 'https', 'websocket'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={protocolFilter === option}
            onClick={() => setProtocolFilter(option)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              protocolFilter === option ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:bg-surface-3'
            )}
          >
            {option === 'all' ? 'All' : option === 'websocket' ? 'WS' : option.toUpperCase()}
          </button>
        ))}
      </div>
      <Button variant="outline" size="sm" onClick={handleTail}>Tail</Button>
      <Button variant="outline" size="sm" onClick={handleClear}>Clear</Button>
      <button
        type="button"
        onClick={() => setShowBookmarksOnly((value) => !value)}
        className={cn(
          'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
          showBookmarksOnly ? 'border-warning/40 bg-warning/10 text-warning' : 'border-hairline text-muted-foreground hover:bg-surface-3'
        )}
      >
        {showBookmarksOnly ? 'Bookmarked' : 'All flows'}
      </button>
      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
        {displayedFlows.length} / {totalFlows || flows.length} flows
      </span>
    </div>
  )

  const flowTable = (
    <FlowTable
      flows={displayedFlows}
      selectedFlowId={selectedFlowSummary?.id ?? null}
      activeIndex={keyboardShortcuts.activeFlowIndex}
      selectedForExport={exportIdSet}
      bookmarkedIds={bookmarkedIdSet}
      sorting={sorting}
      onSortingChange={setSorting}
      onOpenFlow={(flow) => void openFlow(flow)}
      onToggleSelection={handleToggleSelection}
      onToggleBookmark={handleToggleBookmark}
      highlightQuery={activeSearchQuery}
    />
  )

  const trafficStream = (
    <section aria-label="Traffic stream" className="glass-panel flex min-h-[240px] flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3.5">
        <div className="flex items-center gap-2.5 text-xs font-medium"><Activity className="h-3.5 w-3.5 text-accent" />Traffic stream</div>
        <span className="terminal-label flex items-center gap-2 text-[9px] text-muted-foreground">
          <span className={cn('h-1.5 w-1.5 rounded-full', status.running ? 'bg-accent' : 'bg-muted-foreground/50')} />
          {status.running ? 'Capturing' : 'Standby'}
        </span>
      </div>
      {captureControls}
      <div className="min-h-0 flex-1">{flowTable}</div>
    </section>
  )

  const renderView = () => {
    if (view === 'capture' && !initialLoadComplete) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <div className="glass-panel flex items-center gap-4 px-6 py-5">
            <BrandMark className="h-11 w-11" decorative />
            <div>
              <div className="text-sm font-semibold text-foreground">Restoring your workspace</div>
              <div className="mt-1 text-xs text-muted-foreground">Checking proxy status and recent traffic…</div>
            </div>
          </div>
        </div>
      )
    }

    if (view === 'capture' && launchpadVisible) {
      return <ConnectionLaunchpad onChoose={openConnections} onSkip={completeSetup} />
    }

    switch (view) {
      case 'search':
        return (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-5 pb-5 sm:px-6">
            <div className="glass-subpanel shrink-0 p-3">
              <FlowSearch
                onSearch={handleSearch}
                onClear={handleClearSearch}
                initialFilters={activeSearchFilters}
                resultCount={displayedFlows.length}
                totalCount={totalFlows || flows.length}
                isSearching={isLoadingFlows}
                resetToken={searchResetToken}
              />
            </div>
            {trafficStream}
          </div>
        )
      case 'flows':
        return (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-5 pb-5 sm:px-6">
            {trafficStream}
          </div>
        )
      case 'compare':
        return (
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <FlowCompareModal
              flow1={selectedFlowsForCompare[0] || null}
              flow2={selectedFlowsForCompare[1] || null}
              open
              onOpenChange={() => {}}
              token={token || null}
              embedded
            />
          </div>
        )
      case 'sequence':
        return (
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <SequenceDiagramModal flows={flows} open onOpenChange={() => {}} token={token || null} embedded />
          </div>
        )
      case 'replay':
        return (
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <ReplayRequestModal open onOpenChange={() => {}} initialFlow={replaySeed || selectedFlow} token={token || null} embedded />
          </div>
        )
      case 'agents':
        return (
          <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
            <CodexReviewPanel token={token || null} flow={selectedFlow} />
            <div className="glass-subpanel border-dashed p-5 text-center">
              <div className="text-sm font-semibold text-foreground/90">Chat with your traffic</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Native cross-flow chat is coming soon. Today, Agents runs a read-only Codex review of the selected flow above.
              </div>
            </div>
          </div>
        )
      case 'frida':
        return (
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <FridaPanel token={token || null} flows={flows} />
          </div>
        )
      case 'settings':
        return (
          <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
            <CommandDeck
              token={token}
              status={status}
              listenHost={listenHost}
              listenPort={listenPort}
              mode={mode}
              capturePath={capturePath}
              maxBodyBytes={maxBodyBytes}
              autoRefresh={autoRefresh}
              refreshInterval={refreshInterval}
              filterDecodeProto={filterDecodeProto}
              activityLabel={activityLabel}
              message={message}
              connectedClients={connectedClients}
              killingPid={killingPid}
              onTokenChange={handleTokenChange}
              onListenHostChange={setListenHost}
              onListenPortChange={setListenPort}
              onModeChange={setMode}
              onCapturePathChange={setCapturePath}
              onMaxBodyBytesChange={setMaxBodyBytes}
              onAutoRefreshChange={setAutoRefresh}
              onRefreshIntervalChange={setRefreshInterval}
              onDecodeProtoChange={setFilterDecodeProto}
              onRefreshStatus={fetchStatus}
              onStart={handleStart}
              onTail={handleTail}
              onStop={handleStop}
              onClear={handleClear}
              onUseLanHost={() => setListenHost('0.0.0.0')}
              onKillProcess={handleKillProcess}
            />
            <ConnectionSettingsCard status={status} connectedClients={connectedClients} onOpen={() => openConnections()} />
          </div>
        )
      case 'capture':
      default:
        return (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-5 pb-5 sm:px-6">
            <MetricsRow flows={displayedFlows} />
            {trafficStream}
          </div>
        )
    }
  }


  return (
    <div className="app-shell flex flex-col overflow-hidden text-foreground">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-md bg-foreground px-3 py-2 text-sm font-semibold text-background shadow-[var(--elevation-2)] transition-transform focus:translate-y-0"
      >
        Skip to main content
      </a>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{message}</div>
      <div className="flex min-h-0 flex-1">
        <NavRail
          view={view}
          onViewChange={setView}
          running={status.running}
          listenHost={status.listen_host || listenHost}
          listenPort={status.listen_port || listenPort}
          liveLabel={wsStatusLabel}
          liveActive={isActiveTraffic}
          onOpenConnections={() => openConnections()}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <CommandBar
            status={status}
            liveLabel={wsStatusLabel}
            liveActive={isActiveTraffic}
            searchValue={activeSearchQuery}
            searchVisible={view !== 'search'}
            onSearchSubmit={handleGlobalSearch}
            onStart={handleStart}
            onStop={handleStop}
            onOpenReplay={() => {
              setReplaySeed(selectedFlow)
              setView('replay')
            }}
            onOpenExport={() => setExportModalOpen(true)}
            exportCount={selectedFlowsForExport.length}
            onCopyToken={() => copyToClipboard(token)}
            tokenReady={!!token}
            workspaceName={viewTitle}
          />

          <div className="flex min-h-0 flex-1">
            <main id="main-content" tabIndex={-1} className="flex min-w-0 flex-1 flex-col overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              {initialLoadComplete && !(view === 'capture' && launchpadVisible) ? (
                <WorkspaceHeading view={view} running={status.running} onConnect={() => openConnections()} />
              ) : null}
              {renderView()}
            </main>
            {showInspector ? (
              <aside aria-label="Flow inspector" className="hidden w-[380px] shrink-0 py-6 pr-5 2xl:w-[420px] xl:block">
                <FlowInspector
                  flow={selectedFlow}
                  loading={selectedFlowLoading}
                  onReplayRequest={handleReplayRequest}
                  className="h-full"
                  highlightQuery={activeSearchQuery}
                />
              </aside>
            ) : null}
          </div>
          <footer className="flex h-8 shrink-0 items-center justify-between gap-3 border-t border-white/[0.06] px-4 font-mono text-[9px] text-muted-foreground sm:px-6">
            <span className="flex min-w-0 items-center gap-2 truncate"><Radio className="h-3 w-3 shrink-0 text-accent/70" />{activityLabel}<span className="hidden text-muted-foreground/40 sm:inline">/</span><span className="hidden sm:inline">{flows.length} loaded flows</span></span>
            <button type="button" onClick={() => setShortcutsModalOpen(true)} className="flex shrink-0 items-center gap-1.5 rounded px-1 py-1 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"><Keyboard className="h-3 w-3" /><span className="hidden sm:inline">Keyboard shortcuts</span><kbd className="rounded border border-white/10 px-1 text-[8px]">?</kbd></button>
          </footer>
        </div>
      </div>

      {keyboardShortcuts.lastAction ? (
        <div className="fixed bottom-6 right-6 z-50">
          <motion.div
            role="status"
            aria-live="polite"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : undefined}
            className="inline-flex items-center gap-2 rounded-md border border-hairline bg-surface-2 px-4 py-2 text-sm font-medium text-foreground shadow-[var(--elevation-2)]"
          >
            <Keyboard className="h-4 w-4 text-accent" />
            {keyboardShortcuts.lastAction}
          </motion.div>
        </div>
      ) : null}

      <ConnectionDialog
        open={connectionOpen}
        initialSource={connectionSource}
        token={token || null}
        status={status}
        connectedClients={connectedClients}
        lastActivity={lastActivity}
        onOpenChange={(open) => {
          setConnectionOpen(open)
          if (!open) setConnectionSource(null)
        }}
        onPrepareConnection={handlePrepareConnection}
        onComplete={completeSetup}
        onCopyToClipboard={copyToClipboard}
      />
      <FlowInspectModal
        flow={selectedFlow}
        loading={selectedFlowLoading}
        open={isInspectorModalOpen}
        onOpenChange={(open) => {
          if (!open) closeInspector()
        }}
        onReplayRequest={handleReplayRequest}
        highlightQuery={activeSearchQuery}
      />
      <ReplayRequestModal
        open={replayOpen}
        onOpenChange={(open) => {
          setReplayOpen(open)
          if (!open) setReplaySeed(null)
        }}
        initialFlow={replaySeed}
        token={token || null}
      />
      <KeyboardShortcutsModal
        open={shortcutsModalOpen}
        onOpenChange={setShortcutsModalOpen}
        shortcuts={keyboardShortcuts.shortcuts}
      />
      <ExportModal
        flowIds={selectedFlowsForExport.map((flow) => flow.id)}
        open={exportModalOpen}
        onOpenChange={(open) => {
          setExportModalOpen(open)
          if (!open) setSelectedFlowsForExport([])
        }}
        token={token || null}
      />
      <BookmarksPanel
        open={bookmarksPanelOpen}
        onOpenChange={setBookmarksPanelOpen}
        bookmarkedFlowIds={bookmarkedIds}
        flows={flows}
        onSelectFlow={(flow) => {
          void openFlow(flow)
        }}
        onToggleBookmark={handleToggleBookmark}
        onClearAll={handleClearAllBookmarks}
      />
    </div>
  )
}

export default App
