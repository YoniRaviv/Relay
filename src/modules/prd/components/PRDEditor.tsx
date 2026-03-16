import { useRef, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Undo2, Redo2 } from 'lucide-react'

interface PRDEditorProps {
    markdown: string
    onChange: (value: string) => void
    onSave: () => void
}

const MAX_HISTORY = 100

export function PRDEditor({ markdown, onChange, onSave }: PRDEditorProps) {
    const historyRef = useRef<string[]>([markdown])
    const indexRef = useRef(0)
    const isUndoRedoRef = useRef(false)

    // Track changes for undo/redo
    const handleChange = useCallback((value: string) => {
        if (isUndoRedoRef.current) {
            isUndoRedoRef.current = false
            onChange(value)
            return
        }
        // Trim future history and push new state
        const history = historyRef.current.slice(0, indexRef.current + 1)
        history.push(value)
        if (history.length > MAX_HISTORY) history.shift()
        historyRef.current = history
        indexRef.current = history.length - 1
        onChange(value)
    }, [onChange])

    const canUndo = indexRef.current > 0
    const canRedo = indexRef.current < historyRef.current.length - 1

    const handleUndo = useCallback(() => {
        if (indexRef.current <= 0) return
        indexRef.current--
        isUndoRedoRef.current = true
        onChange(historyRef.current[indexRef.current])
    }, [onChange])

    const handleRedo = useCallback(() => {
        if (indexRef.current >= historyRef.current.length - 1) return
        indexRef.current++
        isUndoRedoRef.current = true
        onChange(historyRef.current[indexRef.current])
    }, [onChange])

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                if (e.shiftKey) {
                    e.preventDefault()
                    handleRedo()
                } else {
                    e.preventDefault()
                    handleUndo()
                }
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [handleUndo, handleRedo])

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUndo}
                    disabled={!canUndo}
                    className="h-7 gap-1"
                >
                    <Undo2 className="h-3.5 w-3.5" />
                    Undo
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRedo}
                    disabled={!canRedo}
                    className="h-7 gap-1"
                >
                    <Redo2 className="h-3.5 w-3.5" />
                    Redo
                </Button>
            </div>
            <textarea
                className="flex min-h-[60vh] w-full rounded-md border border-input bg-transparent px-4 py-3 text-sm shadow-sm font-mono leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                value={markdown}
                onChange={(e) => handleChange(e.target.value)}
            />
            <Button onClick={onSave} className="w-full">
                Save & Continue
            </Button>
        </div>
    )
}
