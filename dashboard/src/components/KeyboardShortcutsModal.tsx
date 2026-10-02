import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Keyboard } from '@/components/ui/icons'
import { Button } from './ui/button'
import type { Shortcut } from '@/hooks/useKeyboardShortcuts'

interface KeyboardShortcutsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shortcuts: Shortcut[]
}

const categoryLabels: Record<string, string> = {
  general: 'General',
  navigation: 'Navigation',
  actions: 'Actions',
  flow: 'Flow List',
}

function KeyBadge({ children, isModifier = false }: { children: React.ReactNode; isModifier?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center px-2 py-1 rounded text-xs font-medium border ${
        isModifier
          ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400'
          : 'bg-muted border-border text-foreground'
      }`}
    >
      {children}
    </span>
  )
}

function ShortcutRow({ shortcut, isMac }: { shortcut: Shortcut; isMac: boolean }) {
  const displayKey = shortcut.key === ' ' ? 'Space' : shortcut.key.toUpperCase()
  const modifiers = []

  if (shortcut.ctrl || shortcut.cmd) {
    modifiers.push(isMac ? '⌘' : 'Ctrl')
  }
  if (shortcut.shift) {
    modifiers.push('Shift')
  }
  if (shortcut.alt) {
    modifiers.push(isMac ? '⌥' : 'Alt')
  }

  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors">
      <span className="text-sm text-foreground/90">{shortcut.description}</span>
      <div className="flex items-center gap-1.5">
        {modifiers.map((mod, i) => (
          <KeyBadge key={i} isModifier>
            {mod}
          </KeyBadge>
        ))}
        <KeyBadge>{displayKey}</KeyBadge>
      </div>
    </div>
  )
}

export function KeyboardShortcutsModal({ open, onOpenChange, shortcuts }: KeyboardShortcutsModalProps) {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onOpenChange])

  // Group shortcuts by category
  const groupedShortcuts = shortcuts.reduce(
    (acc, shortcut) => {
      if (!acc[shortcut.category]) {
        acc[shortcut.category] = []
      }
      acc[shortcut.category].push(shortcut)
      return acc
    },
    {} as Record<string, Shortcut[]>
  )

  // Add navigation shortcuts that aren't in the main list
  const allCategories = ['general', 'navigation', 'actions', 'flow'] as const

  const navigationShortcuts = [
    { key: 'Esc', description: 'Close modal', category: 'navigation' as const },
  ]

  const flowShortcuts = [
    { key: 'J', description: 'Navigate down in flow list', category: 'flow' as const },
    { key: 'K', description: 'Navigate up in flow list', category: 'flow' as const },
    { key: '↓', description: 'Navigate down in flow list', category: 'flow' as const },
    { key: '↑', description: 'Navigate up in flow list', category: 'flow' as const },
    { key: 'Enter', description: 'Open selected flow', category: 'flow' as const },
  ]

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="w-full max-w-xl max-h-[85vh] bg-card border border-border rounded-lg shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-muted/30">
              <div className="flex items-center gap-3">
                <Keyboard className="h-5 w-5 text-cyan-400" />
                <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
              </div>
              <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Close keyboard shortcuts">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6 space-y-6">
              {allCategories.map(category => {
                const categoryShortcuts = groupedShortcuts[category] || []
                const hasNavigationExtras = category === 'navigation'
                const hasFlowExtras = category === 'flow'
                const hasContent =
                  categoryShortcuts.length > 0 ||
                  (hasNavigationExtras && navigationShortcuts.length > 0) ||
                  (hasFlowExtras && flowShortcuts.length > 0)

                if (!hasContent) return null

                return (
                  <div key={category} className="space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                      {categoryLabels[category]}
                    </h3>
                    <div className="space-y-1">
                      {categoryShortcuts.map((shortcut, idx) => (
                        <ShortcutRow key={`${shortcut.key}-${idx}`} shortcut={shortcut} isMac={isMac} />
                      ))}
                      {hasNavigationExtras &&
                        navigationShortcuts.map((shortcut, idx) => (
                          <div
                            key={`nav-${idx}`}
                            className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors"
                          >
                            <span className="text-sm text-foreground/90">{shortcut.description}</span>
                            <KeyBadge>{shortcut.key}</KeyBadge>
                          </div>
                        ))}
                      {hasFlowExtras &&
                        flowShortcuts.map((shortcut, idx) => (
                          <div
                            key={`flow-${idx}`}
                            className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors"
                          >
                            <span className="text-sm text-foreground/90">{shortcut.description}</span>
                            <KeyBadge>{shortcut.key}</KeyBadge>
                          </div>
                        ))}
                    </div>
                  </div>
                )
              })}

              {/* Tips section */}
              <div className="pt-4 border-t border-border/50">
                <div className="text-xs text-muted-foreground space-y-2">
                  <p>
                    <span className="text-cyan-400">Tip:</span> Shortcuts work anywhere in the app except when
                    typing in input fields.
                  </p>
                  <p>
                    <span className="text-cyan-400">Note:</span> Use{' '}
                    {isMac ? 'Command (⌘)' : 'Ctrl'} for modifier shortcuts.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border/50 bg-muted/30 flex justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default KeyboardShortcutsModal
