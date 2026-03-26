import { useEffect } from 'react'

interface ShortcutHandlers {
  onToggleLoop?: () => void
  onClosePanel?: () => void
  onNewFeature?: () => void
  onToggleLoopStart?: () => void
  onSettings?: () => void
  onJumpToActiveTask?: () => void
  onFocusBoard?: () => void
}

export function useKeyboardShortcuts({
  onToggleLoop,
  onClosePanel,
  onNewFeature,
  onToggleLoopStart,
  onSettings,
  onJumpToActiveTask,
  onFocusBoard,
}: ShortcutHandlers) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return

      const mod = e.metaKey || e.ctrlKey

      if (e.code === 'Space' && !mod && onToggleLoop) {
        e.preventDefault()
        onToggleLoop()
      }

      if (e.code === 'Escape' && onClosePanel) {
        onClosePanel()
      }

      // Cmd+N — New feature
      if (mod && e.key === 'n' && onNewFeature) {
        e.preventDefault()
        onNewFeature()
      }

      // Cmd+L — Start/toggle loop
      if (mod && e.key === 'l' && onToggleLoopStart) {
        e.preventDefault()
        onToggleLoopStart()
      }

      // Cmd+, — Settings
      if (mod && e.key === ',' && onSettings) {
        e.preventDefault()
        onSettings()
      }

      // Cmd+J — Jump to active task
      if (mod && e.key === 'j' && onJumpToActiveTask) {
        e.preventDefault()
        onJumpToActiveTask()
      }

      // Cmd+B — Focus board view
      if (mod && e.key === 'b' && onFocusBoard) {
        e.preventDefault()
        onFocusBoard()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onToggleLoop, onClosePanel, onNewFeature, onToggleLoopStart, onSettings, onJumpToActiveTask, onFocusBoard])
}
