import { useMemo } from 'react'
import { FileText, Wrench, Clock } from 'lucide-react'
import { formatDuration } from '@/shared/formatters'
import { buildTaskSummary } from '../utils/parseActivity'
import { useRelayStore } from '@/store/useRelayStore'
import type { TaskLog } from '@shared/types'

interface LiveSummaryBarProps {
    logs: TaskLog[]
}

export function LiveSummaryBar({ logs }: LiveSummaryBarProps) {
    const { loopState } = useRelayStore()
    const summary = useMemo(() => buildTaskSummary(logs), [logs])
    const isRunning = loopState === 'running'

    if (summary.toolCalls === 0) return null

    return (
        <div className="flex items-center gap-3 px-4 py-1.5 text-xs text-muted-foreground border-b border-border/50">
            {isRunning && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            )}
            <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {summary.filesModified.length} files edited
            </span>
            <span className="text-border">·</span>
            <span className="flex items-center gap-1">
                <Wrench className="h-3 w-3" />
                {summary.toolCalls} tool calls
            </span>
            <span className="text-border">·</span>
            <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(summary.durationSec * 1000)}
            </span>
        </div>
    )
}
