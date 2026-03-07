import { useEffect } from 'react'

interface ShortcutHandlers {
  onToggleLoop?: () => void
  onClosePanel?: () => void
}

export function useKeyboardShortcuts({ onToggleLoop, onClosePanel }: ShortcutHandlers) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return

      if (e.code === 'Space' && onToggleLoop) {
        e.preventDefault()
        onToggleLoop()
      }

      if (e.code === 'Escape' && onClosePanel) {
        onClosePanel()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onToggleLoop, onClosePanel])
}
