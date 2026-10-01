import { useMemo, useRef } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, Star, Terminal } from '@/components/ui/icons'

import { HighlightedText } from './HighlightedText'
import {
  deriveTags,
  formatBytes,
  getMethodColor,
  getResponseSizeBadgeColor,
  getStatusBadgeColor,
  getUrlDisplayParts,
  truncatePath,
} from '@/lib/flowDisplay'
import type { FlowSummary } from '@/lib/types'

type FlowTableProps = {
  flows: FlowSummary[]
  selectedFlowId?: string | null
  activeIndex?: number | null
  selectedForExport: Set<string>
  bookmarkedIds: Set<string>
  sorting: SortingState
  onSortingChange: (updater: SortingState | ((prev: SortingState) => SortingState)) => void
  onOpenFlow: (flow: FlowSummary) => void
  onToggleSelection: (flow: FlowSummary, checked: boolean) => void
  onToggleBookmark: (flowId: string) => void
  highlightQuery?: string
}

function TagChips({ tags }: { tags: string[] }) {
  if (tags.length === 0) return <span className="text-muted-foreground/40">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded border border-hairline bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
        >
          {tag}
        </span>
      ))}
    </div>
  )
}

export function FlowTable({
  flows,
  selectedFlowId,
  activeIndex,
  selectedForExport,
  bookmarkedIds,
  sorting,
  onSortingChange,
  onOpenFlow,
  onToggleSelection,
  onToggleBookmark,
  highlightQuery = '',
}: FlowTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const columns = useMemo<ColumnDef<FlowSummary>[]>(
    () => [
      {
        id: 'time',
        header: 'Time',
        accessorFn: (row) => row.ts,
        cell: ({ row }) => (
          <span className="font-mono text-[11px] text-muted-foreground">
            {new Date(row.original.ts * 1000).toLocaleTimeString()}
          </span>
        ),
        size: 96,
      },
      {
        id: 'method',
        header: 'Method',
        accessorFn: (row) => row.request?.method || '',
        enableSorting: false,
        cell: ({ row }) => (
          <span className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${getMethodColor(row.original.request?.method || '')}`}>
            {row.original.request?.method || '-'}
          </span>
        ),
        size: 78,
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (row) => row.response?.status_code ?? 0,
        cell: ({ row }) => {
          const status = row.original.response?.status_code
          const size = row.original.response?.body_size
          return (
            <div className="flex items-center gap-1.5">
              {status ? (
                <span className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${getStatusBadgeColor(status)}`}>
                  {status}
                </span>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
              {typeof size === 'number' ? (
                <span className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] ${getResponseSizeBadgeColor(size)}`}>
                  {formatBytes(size)}
                </span>
              ) : null}
            </div>
          )
        },
        size: 130,
      },
      {
        id: 'url',
        header: 'Host / Path',
        accessorFn: (row) => row.request?.url || '',
        enableSorting: false,
        cell: ({ row }) => {
          const parts = getUrlDisplayParts(row.original.request?.url || '', row.original.request?.host, row.original.request?.path)
          return (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="shrink-0 font-mono text-[11px] text-accent/80">{parts.host}</span>
                <span className="truncate font-mono text-xs text-foreground/85" title={row.original.request?.url || ''}>
                  <HighlightedText text={truncatePath(parts.path || '/', 64)} query={highlightQuery} />
                </span>
              </div>
            </div>
          )
        },
        minSize: 240,
      },
      {
        id: 'tags',
        header: 'Tags',
        enableSorting: false,
        cell: ({ row }) => (
          <TagChips tags={deriveTags(row.original.request?.url || '', row.original.request?.host)} />
        ),
        size: 140,
      },
    ],
    [highlightQuery]
  )

  const table = useReactTable({
    data: flows,
    columns,
    state: { sorting },
    onSortingChange: onSortingChange as never,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
  })

  const rows = table.getRowModel().rows
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 40,
    overscan: 12,
  })

  const allSelected = flows.length > 0 && flows.every((flow) => selectedForExport.has(flow.id))
  const gridTemplate = '36px 32px 96px 84px 132px minmax(0,1fr) 150px'

  if (rows.length === 0) {
    return (
      <div className="flex h-full min-h-[180px] flex-col items-center justify-center px-6 py-8 text-center">
        <div className="relative mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/15 bg-accent/[0.035] shadow-[var(--glass-highlight)]">
          <Terminal className="h-6 w-6 text-accent/75" />
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-[3px] border-background bg-accent/60" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium tracking-tight text-foreground/90">No flows to display</p>
        <p className="mt-2 max-w-[280px] text-xs leading-6 text-muted-foreground">Connect a source to capture traffic, or adjust your filters to find an exchange.</p>
        <span className="terminal-label mt-5 text-[8px] text-accent/45">Waiting for the next signal</span>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="border-b border-hairline px-3 py-1.5 font-mono text-[10px] text-muted-foreground sm:hidden">
        Swipe horizontally to inspect request details
      </div>
      <div
        role="grid"
        aria-label="Captured flows. Scroll horizontally to view every column."
        tabIndex={0}
        className="min-h-0 flex-1 overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <div className="flex h-full min-w-[760px] flex-col">
          <div
            role="row"
            className="grid items-center border-b border-white/[0.07] bg-white/[0.015] px-3 py-3 font-mono text-[9px] font-normal uppercase tracking-[0.1em] text-muted-foreground"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div role="columnheader" className="flex items-center">
              <input
                type="checkbox"
                aria-label="Select all flows"
                className="h-3.5 w-3.5 rounded border border-hairline bg-surface-1 accent-accent"
                checked={allSelected}
                onChange={(event) => {
                  flows.forEach((flow) => onToggleSelection(flow, event.target.checked))
                }}
              />
            </div>
            <div role="columnheader" />
            {table.getHeaderGroups()[0]?.headers.map((header) => {
              const canSort = header.column.getCanSort()
              const sorted = header.column.getIsSorted()
              const content = (
                <>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {sorted === 'asc' ? <ArrowUp aria-hidden="true" className="h-3 w-3" /> : sorted === 'desc' ? <ArrowDown aria-hidden="true" className="h-3 w-3" /> : null}
                </>
              )
              return canSort ? (
                <div
                  key={header.id}
                  role="columnheader"
                  aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-1 px-2 text-left hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {content}
                  </button>
                </div>
              ) : (
                <div key={header.id} role="columnheader" className="flex items-center gap-1 px-2">
                  {content}
                </div>
              )
            })}
          </div>

          <div ref={scrollRef} role="rowgroup" className="min-h-0 flex-1 overflow-y-auto">
            {rows.length === 0 ? (
              <div className="flex h-full min-h-[200px] items-center justify-center px-6 py-12 text-center text-sm text-muted-foreground">
                No flows match the current filters.
              </div>
            ) : (
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const row = rows[virtualRow.index]
                  const flow = row.original
                  const isSelected = selectedFlowId === flow.id
                  const isForExport = selectedForExport.has(flow.id)
                  const isBookmarked = bookmarkedIds.has(flow.id)
                  const isActive = activeIndex === virtualRow.index
                  const method = flow.request?.method || 'Request'
                  const url = flow.request?.url || 'unknown URL'
                  const status = flow.response?.status_code ? `, status ${flow.response.status_code}` : ''
                  return (
                    <div
                      key={row.id}
                      role="row"
                      tabIndex={0}
                      aria-label={`Inspect ${method} ${url}${status}`}
                      data-index={virtualRow.index}
                      ref={virtualizer.measureElement}
                      onClick={() => onOpenFlow(flow)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onOpenFlow(flow)
                        }
                      }}
                      className={`group absolute left-0 top-0 grid w-full cursor-pointer items-center border-b border-hairline/60 pl-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60 ${
                        isSelected ? 'bg-accent/[0.075] shadow-[inset_2px_0_0_hsl(var(--accent))]' : isForExport ? 'bg-accent/[0.05]' : 'hover:bg-white/[0.025]'
                      } ${isActive ? 'ring-1 ring-inset ring-accent/40' : ''} ${isBookmarked ? 'shadow-[inset_3px_0_0_hsl(var(--warning))]' : ''}`}
                      style={{ transform: `translateY(${virtualRow.start}px)`, gridTemplateColumns: gridTemplate }}
                    >
                      <div role="gridcell" className="flex items-center py-2" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select flow ${flow.id}`}
                          className="h-3.5 w-3.5 rounded border border-hairline bg-surface-1 accent-accent"
                          checked={isForExport}
                          onChange={(event) => onToggleSelection(flow, event.target.checked)}
                        />
                      </div>
                      <div role="gridcell" className="flex items-center" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
                      onClick={() => onToggleBookmark(flow.id)}
                      className={`inline-flex h-6 w-6 items-center justify-center rounded transition-colors ${
                        isBookmarked ? 'text-warning' : 'text-muted-foreground hover:text-warning'
                      }`}
                    >
                      <Star className={`h-3.5 w-3.5 ${isBookmarked ? 'fill-current' : ''}`} />
                    </button>
                      </div>
                      {row.getVisibleCells().map((cell) => (
                        <div key={cell.id} role="gridcell" className="min-w-0 px-2 py-2">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
