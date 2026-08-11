import { useEffect, useRef, useCallback, useState } from 'react'

type ShortcutAction = () => void

interface Shortcut {
  key: string
  ctrl?: boolean
  cmd?: boolean
  shift?: boolean
  alt?: boolean
  description: string
  category: 'navigation' | 'actions' | 'flow' | 'general'
  action: ShortcutAction
}

interface UseKeyboardShortcutsOptions {
  onShowHelp: () => void
  onRefresh: () => void
  onFocusSearch: () => void
  onStartProxy: () => void
  onStopProxy: () => void
  onClearFlows: () => void
  onCloseModal: () => void
  onNavigateDown: () => void
  onNavigateUp: () => void
  onOpenSelected: () => void
  onToggleBookmark?: () => void
  onOpenBookmarks?: () => void
  onToggleFrida?: () => void
  isModalOpen: boolean
  flowsLength: number
}

interface KeyboardShortcutState {
  activeFlowIndex: number | null
  lastAction: string | null
}

export function useKeyboardShortcuts({
  onShowHelp,
  onRefresh,
  onFocusSearch,
  onStartProxy,
  onStopProxy,
  onClearFlows,
  onCloseModal,
  onNavigateDown,
  onNavigateUp,
  onOpenSelected,
  onToggleBookmark,
  onOpenBookmarks,
  onToggleFrida,
  isModalOpen,
  flowsLength,
}: UseKeyboardShortcutsOptions) {
  const [state, setState] = useState<KeyboardShortcutState>({
    activeFlowIndex: null,
    lastAction: null,
  })

  const stateRef = useRef(state)
  stateRef.current = state

  const showToast = useCallback((message: string) => {
    setState(prev => ({ ...prev, lastAction: message }))
    setTimeout(() => {
      setState(prev => ({ ...prev, lastAction: null }))
    }, 1500)
  }, [])

  const shortcuts: Shortcut[] = [
    {
      key: '?',
      description: 'Show keyboard shortcuts',
      category: 'general',
      action: () => {
        onShowHelp()
        showToast('Keyboard shortcuts')
      },
    },
    {
      key: 'r',
      ctrl: true,
      description: 'Refresh/Tail flows',
      category: 'actions',
      action: () => {
        onRefresh()
        showToast('Flows refreshed')
      },
    },
    {
      key: 'r',
      cmd: true,
      description: 'Refresh/Tail flows',
      category: 'actions',
      action: () => {
        onRefresh()
        showToast('Flows refreshed')
      },
    },
    {
      key: 'f',
      ctrl: true,
      description: 'Focus search input',
      category: 'navigation',
      action: () => {
        onFocusSearch()
        showToast('Search focused')
      },
    },
    {
      key: 'f',
      cmd: true,
      description: 'Focus search input',
      category: 'navigation',
      action: () => {
        onFocusSearch()
        showToast('Search focused')
      },
    },
    {
      key: 's',
      ctrl: true,
      description: 'Start proxy',
      category: 'actions',
      action: () => {
        onStartProxy()
        showToast('Starting proxy...')
      },
    },
    {
      key: 's',
      cmd: true,
      description: 'Start proxy',
      category: 'actions',
      action: () => {
        onStartProxy()
        showToast('Starting proxy...')
      },
    },
    {
      key: 'x',
      ctrl: true,
      description: 'Stop proxy',
      category: 'actions',
      action: () => {
        onStopProxy()
        showToast('Stopping proxy...')
      },
    },
    {
      key: 'x',
      cmd: true,
      description: 'Stop proxy',
      category: 'actions',
      action: () => {
        onStopProxy()
        showToast('Stopping proxy...')
      },
    },
    {
      key: 'c',
      ctrl: true,
      description: 'Clear flows',
      category: 'actions',
      action: () => {
        onClearFlows()
        showToast('Flows cleared')
      },
    },
    {
      key: 'c',
      cmd: true,
      description: 'Clear flows',
      category: 'actions',
      action: () => {
        onClearFlows()
        showToast('Flows cleared')
      },
    },
    {
      key: 'b',
      description: 'Toggle bookmark for selected flow',
      category: 'flow',
      action: () => {
        if (onToggleBookmark) {
          onToggleBookmark()
          showToast('Bookmark toggled')
        }
      },
    },
    {
      key: 'b',
      shift: true,
      description: 'Open bookmarks panel',
      category: 'flow',
      action: () => {
        if (onOpenBookmarks) {
          onOpenBookmarks()
          showToast('Bookmarks opened')
        }
      },
    },
    {
      key: 'f',
      shift: true,
      description: 'Toggle Frida panel',
      category: 'general',
      action: () => {
        if (onToggleFrida) {
          onToggleFrida()
          showToast('Frida panel toggled')
        }
      },
    },
  ]

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable

      // Always allow Escape to close modals
      if (e.key === 'Escape' && isModalOpen) {
        e.preventDefault()
        onCloseModal()
        return
      }

      // Ignore shortcuts when typing in inputs
      if (isInput && !['Escape'].includes(e.key)) {
        return
      }

      // Handle flow navigation with j/k and arrow keys
      if (!isModalOpen && flowsLength > 0) {
        if ((e.key === 'j' || e.key === 'ArrowDown') && !e.ctrlKey && !e.metaKey) {
          e.preventDefault()
          const newIndex =
            stateRef.current.activeFlowIndex === null
              ? 0
              : Math.min(stateRef.current.activeFlowIndex + 1, flowsLength - 1)
          setState(prev => ({ ...prev, activeFlowIndex: newIndex }))
          onNavigateDown()
          return
        }

        if ((e.key === 'k' || e.key === 'ArrowUp') && !e.ctrlKey && !e.metaKey) {
          e.preventDefault()
          const newIndex =
            stateRef.current.activeFlowIndex === null
              ? flowsLength - 1
              : Math.max(stateRef.current.activeFlowIndex - 1, 0)
          setState(prev => ({ ...prev, activeFlowIndex: newIndex }))
          onNavigateUp()
          return
        }

        if (e.key === 'Enter' && stateRef.current.activeFlowIndex !== null) {
          e.preventDefault()
          onOpenSelected()
          return
        }
      }

      // Match shortcuts
      for (const shortcut of shortcuts) {
        if (e.key.toLowerCase() !== shortcut.key.toLowerCase()) continue

        const hasCtrl = e.ctrlKey || e.metaKey
        const matchesCtrl = shortcut.ctrl === undefined || hasCtrl === shortcut.ctrl
        const matchesCmd = shortcut.cmd === undefined || hasCtrl === shortcut.cmd
        const matchesShift = (shortcut.shift ?? false) === e.shiftKey

        if (matchesCtrl && matchesCmd && matchesShift) {
          e.preventDefault()
          shortcut.action()
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    shortcuts,
    isModalOpen,
    flowsLength,
    onCloseModal,
    onNavigateDown,
    onNavigateUp,
    onOpenSelected,
  ])

  const resetActiveIndex = useCallback(() => {
    setState(prev => ({ ...prev, activeFlowIndex: null }))
  }, [])

  const setActiveIndex = useCallback((index: number | null) => {
    setState(prev => ({ ...prev, activeFlowIndex: index }))
  }, [])

  return {
    activeFlowIndex: state.activeFlowIndex,
    lastAction: state.lastAction,
    resetActiveIndex,
    setActiveIndex,
    shortcuts,
  }
}

export type { Shortcut, UseKeyboardShortcutsOptions }
