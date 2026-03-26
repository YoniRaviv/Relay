import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { StreamingProgress } from './StreamingProgress'

interface PRDPreviewProps {
    markdown: string
    streaming: boolean
    agentStatus?: string
    onEdit: () => void
    onApprove: () => void
}

const ANALYZING_MESSAGES = [
    'Reading your project structure...',
    'Analyzing feature requirements...',
    'Understanding codebase context...',
    'Reviewing referenced files...',
    'Drafting specification outline...',
    'Preparing document structure...',
]

export function PRDPreview({ markdown, streaming, agentStatus, onEdit, onApprove }: PRDPreviewProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [messageIndex, setMessageIndex] = useState(0)

    useEffect(() => {
        if (streaming && containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight
        }
    }, [markdown, streaming])

    // Rotate status messages while streaming with no content yet
    useEffect(() => {
        if (!streaming || markdown) return
        setMessageIndex(0)
        const interval = setInterval(() => {
            setMessageIndex(i => (i + 1) % ANALYZING_MESSAGES.length)
        }, 3500)
        return () => clearInterval(interval)
    }, [streaming, markdown])

    return (
        <div className="space-y-6">
            <StreamingProgress
                agentStatus={agentStatus}
                hasContent={!!markdown}
                complete={!streaming && !!markdown}
            />
            <div
                ref={containerRef}
                className="overflow-auto"
            >
                {markdown ? (
                    <div className="prose prose-sm prose-tight dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {markdown}
                        </ReactMarkdown>
                        {streaming && (
                            <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5 align-middle rounded-sm" />
                        )}
                    </div>
                ) : streaming ? (
                    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground transition-opacity duration-300">
                        {ANALYZING_MESSAGES[messageIndex]}
                    </div>
                ) : null}
            </div>
            {!streaming && markdown && (
                <div className="flex gap-3 pt-2 border-t border-border">
                    <Button variant="outline" onClick={onEdit} className="flex-1">
                        Edit Specification
                    </Button>
                    <Button onClick={onApprove} className="flex-1">
                        Approve & Decompose
                    </Button>
                </div>
            )}
        </div>
    )
}
