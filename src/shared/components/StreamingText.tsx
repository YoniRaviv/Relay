import { useEffect, useRef } from 'react'

interface StreamingTextProps {
    text: string
    className?: string
}

export function StreamingText({ text, className = '' }: StreamingTextProps) {
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight
        }
    }, [text])

    return (
        <div
            ref={containerRef}
            className={`overflow-auto whitespace-pre-wrap font-mono text-sm ${className}`}
        >
            {text}
            <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />
        </div>
    )
}
