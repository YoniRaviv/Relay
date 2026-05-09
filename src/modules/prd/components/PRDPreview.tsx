import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AlertTriangle } from 'lucide-react'
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

const PATH_PATTERN = /\.(tsx?|jsx|py|rs|go|rb|java)\b|\bsrc\/|\belectron\/|\bshared\//

function findPathLeaks(markdown: string): string[] {
    const offending: string[] = []
    const lines = markdown.split('\n')
    let inFence = false
    for (const line of lines) {
        if (line.trimStart().startsWith('```')) { inFence = !inFence; continue }
        if (inFence) continue
        if (PATH_PATTERN.test(line)) offending.push(line.trim())
        if (offending.length >= 5) break
    }
    return offending
}

export function PRDPreview({ markdown, streaming, agentStatus, onEdit, onApprove }: PRDPreviewProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [messageIndex, setMessageIndex] = useState(0)
    const [visible, setVisible] = useState(true)

    const pathLeaks = useMemo(
        () => (streaming || !markdown ? [] : findPathLeaks(markdown)),
        [markdown, streaming],
    )

    useEffect(() => {
        if (streaming && containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight
        }
    }, [markdown, streaming])

    // Rotate status messages with fade animation while streaming with no content yet
    useEffect(() => {
        if (!streaming || markdown) return
        setMessageIndex(0)
        setVisible(true)
        const interval = setInterval(() => {
            setVisible(false)
            setTimeout(() => {
                setMessageIndex(i => (i + 1) % ANALYZING_MESSAGES.length)
                setVisible(true)
            }, 300)
        }, 5000)
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
                    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                        <span className={`transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}>
                            {ANALYZING_MESSAGES[messageIndex]}
                        </span>
                    </div>
                ) : null}
            </div>
            {!streaming && markdown && pathLeaks.length > 0 && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    <div className="flex items-start gap-2">
                        <AlertTriangle className="size-3.5 mt-0.5 flex-shrink-0" />
                        <div className="space-y-1">
                            <div className="font-medium">Specification references file paths or code</div>
                            <div className="opacity-80">Paths and code go stale fast and pollute the spec. Consider editing these out — or approve anyway, this is non-blocking.</div>
                            <ul className="mt-1 list-disc pl-4 opacity-80 space-y-0.5">
                                {pathLeaks.slice(0, 3).map((line, i) => (
                                    <li key={i} className="font-mono truncate">{line.length > 120 ? line.slice(0, 117) + '…' : line}</li>
                                ))}
                                {pathLeaks.length > 3 && (
                                    <li className="opacity-60">…and {pathLeaks.length - 3} more</li>
                                )}
                            </ul>
                        </div>
                    </div>
                </div>
            )}
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
