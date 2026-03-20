import { useState, useEffect, useRef, useCallback } from 'react'
import { FileText } from 'lucide-react'

interface FileAutocompleteProps {
    query: string
    projectId: string
    onSelect: (filePath: string) => void
    onDismiss: () => void
}

export function FileAutocomplete({ query, projectId, onSelect, onDismiss }: FileAutocompleteProps) {
    const [results, setResults] = useState<string[]>([])
    const [selectedIndex, setSelectedIndex] = useState(0)
    const containerRef = useRef<HTMLDivElement>(null)
    const debounceRef = useRef<ReturnType<typeof setTimeout>>()

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(async () => {
            try {
                const files = await window.relayAPI.listProjectFiles(projectId, query)
                setResults(files)
                setSelectedIndex(0)
            } catch {
                setResults([])
            }
        }, 150)
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    }, [query, projectId])

    const handleSelect = useCallback((file: string) => onSelect(file), [onSelect])

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            // Only intercept when a textarea is focused (the one that triggered autocomplete)
            if (!(document.activeElement instanceof HTMLTextAreaElement)) return

            if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelectedIndex(i => Math.min(i + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelectedIndex(i => Math.max(i - 1, 0))
            } else if (e.key === 'Enter' && results.length > 0) {
                e.preventDefault()
                handleSelect(results[selectedIndex])
            } else if (e.key === 'Escape') {
                e.preventDefault()
                onDismiss()
            }
        }
        window.addEventListener('keydown', handler, true)
        return () => window.removeEventListener('keydown', handler, true)
    }, [results, selectedIndex, handleSelect, onDismiss])

    useEffect(() => {
        const container = containerRef.current
        if (!container) return
        const item = container.children[selectedIndex] as HTMLElement | undefined
        item?.scrollIntoView({ block: 'nearest' })
    }, [selectedIndex])

    if (results.length === 0 && query.length > 0) {
        return (
            <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-border bg-[var(--color-card)] shadow-xl p-3">
                <p className="text-xs text-muted-foreground">No matching files</p>
            </div>
        )
    }

    if (results.length === 0) return null

    return (
        <div
            ref={containerRef}
            className="absolute left-0 right-0 top-full mt-1 z-50 max-h-60 overflow-auto rounded-lg border border-border bg-[var(--color-card)] shadow-xl py-1"
        >
            {results.map((file, i) => (
                <button
                    key={file}
                    type="button"
                    onClick={() => handleSelect(file)}
                    className={`w-full text-left px-3 py-1.5 text-xs font-mono flex items-center gap-2 ${
                        i === selectedIndex ? 'bg-accent text-foreground' : 'text-foreground/80 hover:bg-accent/50'
                    }`}
                >
                    <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate">{file}</span>
                </button>
            ))}
        </div>
    )
}
