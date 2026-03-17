import { useState } from 'react'
import { MessageSquare, AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { TaskLog } from '@shared/types'

interface TextBlockProps {
    log: TaskLog
}

const MAX_LINES = 3

export function TextBlock({ log }: TextBlockProps) {
    const [showMore, setShowMore] = useState(false)
    const isError = log.type === 'error'
    const isWarning = log.type === 'warning'
    const isCompletion = log.toolName === 'task_complete' || log.content.startsWith('Task complete')

    const lines = log.content.split('\n')
    const isTruncatable = lines.length > MAX_LINES
    const displayContent = showMore ? log.content : lines.slice(0, MAX_LINES).join('\n')

    return (
        <div className={`flex gap-2 py-1.5 px-2 text-xs rounded ${isCompletion ? 'bg-emerald-500/10' : isWarning ? 'bg-amber-500/10' : ''}`}>
            <div className="mt-0.5 shrink-0">
                {isError ? (
                    <AlertCircle className="h-3.5 w-3.5 text-rose-500" />
                ) : isWarning ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                ) : isCompletion ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <p className={`whitespace-pre-wrap break-words ${isError ? 'text-destructive' : isWarning ? 'text-amber-700 dark:text-amber-400' : isCompletion ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-muted-foreground'}`}>
                    {displayContent}
                </p>
                {isTruncatable && (
                    <button
                        type="button"
                        className="text-sky-600 dark:text-sky-400 hover:underline mt-0.5"
                        onClick={() => setShowMore(!showMore)}
                    >
                        {showMore ? 'Show less' : 'Show more'}
                    </button>
                )}
            </div>
        </div>
    )
}
