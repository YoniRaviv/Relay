import { useState } from 'react'
import { FileText, Pencil, Terminal, CheckCircle, AlertCircle, ChevronRight } from 'lucide-react'
import type { ActionGroup } from '@/shared/types/activity'

const categoryIcons = {
    read: <FileText className="h-3.5 w-3.5 text-sky-500" />,
    write: <Pencil className="h-3.5 w-3.5 text-amber-500" />,
    execute: <Terminal className="h-3.5 w-3.5 text-violet-500" />,
    other: <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />,
}

function formatTimeAgo(ts: string): string {
    const diff = Math.round((Date.now() - new Date(ts).getTime()) / 1000)
    if (diff < 5) return 'just now'
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

interface ActionBlockProps {
    action: ActionGroup
}

export function ActionBlock({ action }: ActionBlockProps) {
    const [expanded, setExpanded] = useState(false)
    const icon = categoryIcons[action.category]
    const isError = action.status === 'error'
    const isRunning = action.status === 'running'

    return (
        <div
            className={`border-l-2 ${isError ? 'border-l-rose-500' : isRunning ? 'border-l-sky-500' : 'border-l-transparent'}`}
        >
            <button
                type="button"
                className="flex items-center gap-2 w-full py-1.5 px-2 text-xs hover:bg-muted/50 rounded-r text-left"
                onClick={() => setExpanded(!expanded)}
            >
                <ChevronRight className={`h-3 w-3 text-muted-foreground shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                <span className="shrink-0">{icon}</span>
                <span className="font-medium text-foreground">{action.label}</span>
                {action.filePath && (
                    <span className="text-muted-foreground truncate min-w-0">{action.filePath}</span>
                )}
                <span className="ml-auto shrink-0 text-muted-foreground">
                    {isRunning ? (
                        <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                            running
                        </span>
                    ) : isError ? (
                        <span className="flex items-center gap-1 text-rose-500">
                            <AlertCircle className="h-3 w-3" />
                            error
                        </span>
                    ) : (
                        formatTimeAgo(action.startTime)
                    )}
                </span>
            </button>

            {expanded && (
                <div className="ml-7 mr-2 mb-1.5 text-xs space-y-1">
                    {action.toolUseLog.toolInput && (
                        <pre className="bg-muted/60 rounded p-2 overflow-auto max-h-32 text-[11px] text-muted-foreground font-mono whitespace-pre-wrap break-all">
                            {formatToolInput(action.toolUseLog.toolInput)}
                        </pre>
                    )}
                    {action.resultLog && (
                        <pre className={`rounded p-2 overflow-auto max-h-32 text-[11px] font-mono whitespace-pre-wrap break-all ${isError ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' : 'bg-muted/40 text-muted-foreground'}`}>
                            {action.resultLog.content}
                        </pre>
                    )}
                </div>
            )}
        </div>
    )
}

function formatToolInput(input: Record<string, unknown>): string {
    const filtered = { ...input }
    // Truncate long content fields for display
    if (typeof filtered.content === 'string' && (filtered.content as string).length > 200) {
        filtered.content = (filtered.content as string).slice(0, 200) + '...'
    }
    return JSON.stringify(filtered, null, 2)
}
