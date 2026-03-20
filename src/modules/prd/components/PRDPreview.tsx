import { useEffect, useRef } from 'react'
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

export function PRDPreview({ markdown, streaming, agentStatus, onEdit, onApprove }: PRDPreviewProps) {
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (streaming && containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight
        }
    }, [markdown, streaming])

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
                    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                        Waiting for content...
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
