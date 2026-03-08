import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'

interface PRDPreviewProps {
    markdown: string
    streaming: boolean
    agentStatus?: string
    onEdit: () => void
    onApprove: () => void
}

export function PRDPreview({ markdown, streaming, agentStatus, onEdit, onApprove }: PRDPreviewProps) {
    const containerRef = useRef<HTMLDivElement>(null)

    // Auto-scroll to bottom while streaming
    useEffect(() => {
        if (streaming && containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight
        }
    }, [markdown, streaming])

    return (
        <div className="space-y-4">
            <div
                ref={containerRef}
                className="border rounded-md p-6 max-h-[65vh] overflow-auto bg-muted/30"
            >
                {markdown ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {markdown}
                        </ReactMarkdown>
                        {streaming && (
                            <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5 align-middle rounded-sm" />
                        )}
                    </div>
                ) : streaming ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
                        <span className="inline-block w-1.5 h-4 bg-primary animate-pulse rounded-sm" />
                        <span>{agentStatus || 'Generating PRD...'}</span>
                    </div>
                ) : null}
            </div>
            {!streaming && markdown && (
                <div className="flex gap-2">
                    <Button variant="outline" onClick={onEdit} className="flex-1">
                        Edit PRD
                    </Button>
                    <Button onClick={onApprove} className="flex-1">
                        Approve & Decompose
                    </Button>
                </div>
            )}
        </div>
    )
}
