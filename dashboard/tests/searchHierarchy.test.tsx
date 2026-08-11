import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { FlowSearch } from '../src/components/FlowSearch'
import { CommandBar } from '../src/components/layout/CommandBar'

const handlers = {
  onSearchSubmit: vi.fn(),
  onStart: vi.fn(),
  onStop: vi.fn(),
  onOpenReplay: vi.fn(),
  onOpenExport: vi.fn(),
  onCopyToken: vi.fn(),
}

describe('search hierarchy', () => {
  it('shows quick search outside the Search workspace', () => {
    const html = renderToStaticMarkup(
      <CommandBar
        status={{ running: false, capture_path: '' }}
        liveLabel="Offline"
        liveActive={false}
        searchValue=""
        searchVisible
        exportCount={0}
        tokenReady={false}
        {...handlers}
      />,
    )

    expect(html).toContain('name="flow-search"')
    expect(html).toContain('Quick search flows')
    expect(html).toContain('Open advanced search')
    expect(html).not.toContain('Advanced search')
  })

  it('replaces quick search with workspace context inside Search', () => {
    const html = renderToStaticMarkup(
      <CommandBar
        status={{ running: false, capture_path: '' }}
        liveLabel="Offline"
        liveActive={false}
        searchValue="api.example.test"
        searchVisible={false}
        exportCount={0}
        tokenReady={false}
        {...handlers}
      />,
    )

    expect(html).not.toContain('name="flow-search"')
    expect(html).toContain('Advanced search')
    expect(html).toContain('Presets, saved views, and filters')
  })

  it('keeps a quick-search query after the advanced workspace mounts', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const onSearch = vi.fn()
    vi.useFakeTimers()

    await act(async () => root.render(
      <FlowSearch
        onSearch={onSearch}
        onClear={vi.fn()}
        initialFilters={{
          query: 'api.example.test',
          method: '',
          statusMin: '',
          statusMax: '',
          timeFrom: '',
          timeTo: '',
        }}
      />,
    ))

    expect(container.querySelector<HTMLInputElement>('input[name="flow-search-query"]')?.value).toBe('api.example.test')
    await act(async () => vi.advanceTimersByTime(350))
    expect(onSearch).not.toHaveBeenCalled()

    await act(async () => root.unmount())
    vi.useRealTimers()
  })
})
