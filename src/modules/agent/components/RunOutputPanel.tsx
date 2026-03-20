import { useState, useRef, useEffect, useCallback } from 'react'
import { useIpcListener } from '@/shared/hooks/useIpcListener'

const MAX_LINES = 5000
const URL_REGEX = /(https?:\/\/[^\s]+)/g

function LinkifiedText({ text }: { text: string }) {
    const parts = text.split(URL_REGEX)
    if (parts.length === 1) return <span>{text}</span>

    return (
        <span>
            {parts.map((part, i) =>
                URL_REGEX.test(part) ? (
                    <a
                        key={i}
                        href={part}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline text-primary hover:text-primary/80"
                        onClick={(e) => {
                            e.preventDefault()
                            window.open(part, '_blank')
                        }}
                    >
                        {part}
                    </a>
                ) : (
                    <span key={i}>{part}</span>
                )
            )}
        </span>
    )
}

export function RunOutputPanel() {
    const [lines, setLines] = useState<Array<{ text: string; type: 'stdout' | 'stderr' | 'exit' }>>([])
    const containerRef = useRef<HTMLDivElement>(null)

    const appendLine = useCallback((text: string, type: 'stdout' | 'stderr' | 'exit') => {
        setLines(prev => {
            const next = [...prev, { text, type }]
            return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next
        })
    }, [])

    useIpcListener('project:stdout', useCallback((data: unknown) => {
        appendLine(data as string, 'stdout')
    }, [appendLine]))

    useIpcListener('project:stderr', useCallback((data: unknown) => {
        appendLine(data as string, 'stderr')
    }, [appendLine]))

    useIpcListener('project:processExit', useCallback((data: unknown) => {
        const { code, signal } = data as { code: number | null; signal: string | null }
        appendLine(`Process exited${code !== null ? ` with code ${code}` : ''}${signal ? ` (${signal})` : ''}`, 'exit')
    }, [appendLine]))

    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight
        }
    }, [lines])

    if (lines.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
                Run output will appear here
            </div>
        )
    }

    return (
        <div ref={containerRef} className="flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed">
            {lines.map((line, i) => (
                <div
                    key={i}
                    className={
                        line.type === 'stderr' ? 'text-amber-600 dark:text-amber-400' :
                        line.type === 'exit' ? 'text-muted-foreground italic mt-1' :
                        'text-foreground/80'
                    }
                >
                    <LinkifiedText text={line.text} />
                </div>
            ))}
        </div>
    )
}
