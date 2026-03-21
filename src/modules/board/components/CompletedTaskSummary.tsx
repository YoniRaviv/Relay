import { useMemo, useState } from 'react'
import { Clock, Wrench, FileText, Pencil, Terminal, ChevronDown, CheckCircle2 } from 'lucide-react'
import { formatDuration } from '@/shared/formatters'
import { buildTaskSummary, groupActions } from '@/modules/agent/utils/parseActivity'
import { ActionBlock } from '@/modules/agent/components/ActionBlock'
import { TextBlock } from '@/modules/agent/components/TextBlock'
import { isActionGroup } from '@/shared/types/activity'
import type { TaskLog } from '@shared/types'

interface DbMetrics {
    durationMs: number
    toolCalls: number
    tokensIn: number
    tokensOut: number
    model?: string
    filesChanged?: string[]
}

interface CompletedTaskSummaryProps {
    activity: TaskLog[]
    dbMetrics?: DbMetrics | null
}

export function CompletedTaskSummary({ activity, dbMetrics }: CompletedTaskSummaryProps) {
    const [showFullLog, setShowFullLog] = useState(false)
    const summary = useMemo(() => buildTaskSummary(activity), [activity])
    const grouped = useMemo(() => groupActions(activity), [activity])

    return (
        <div className="space-y-3">
            {/* Completion summary — the main takeaway */}
            {summary.completionSummary && (
                <div className="flex gap-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-foreground leading-relaxed">
                        {summary.completionSummary}
                    </p>
                </div>
            )}

            {/* Compact stats strip */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    {formatDuration((summary.durationSec > 0 ? summary.durationSec * 1000 : dbMetrics?.durationMs) ?? 0)}
                </span>
                <span className="flex items-center gap-1.5">
                    <Wrench className="h-3 w-3" />
                    {summary.toolCalls > 0 ? summary.toolCalls : dbMetrics?.toolCalls ?? 0} actions
                </span>
                {(summary.filesModified.length > 0 || (dbMetrics?.filesChanged?.length ?? 0) > 0) && (
                    <span className="flex items-center gap-1.5">
                        <Pencil className="h-3 w-3" />
                        {summary.filesModified.length > 0 ? summary.filesModified.length : dbMetrics?.filesChanged?.length ?? 0} edited
                    </span>
                )}
                {summary.filesRead.length > 0 && (
                    <span className="flex items-center gap-1.5">
                        <FileText className="h-3 w-3" />
                        {summary.filesRead.length} read
                    </span>
                )}
            </div>

            {/* Files modified — compact inline list */}
            {(() => {
                const files = summary.filesModified.length > 0 ? summary.filesModified : dbMetrics?.filesChanged ?? []
                if (files.length === 0) return null
                return (
                    <div className="space-y-1">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            Files changed
                        </span>
                        <div className="flex flex-wrap gap-1">
                            {files.map((f) => (
                                <span
                                    key={f}
                                    className="text-[11px] font-mono bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded px-1.5 py-0.5"
                                >
                                    {shortPath(f)}
                                </span>
                            ))}
                        </div>
                    </div>
                )
            })()}

            {/* Tool breakdown — inline chips */}
            {Object.keys(summary.toolBreakdown).length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                    {Object.entries(summary.toolBreakdown)
                        .sort(([, a], [, b]) => b - a)
                        .map(([label, count]) => (
                            <span key={label} className="inline-flex items-center gap-1 text-[11px] bg-muted/60 rounded-full px-2 py-0.5 text-muted-foreground">
                                {toolIcon(label)}
                                {label} ×{count}
                            </span>
                        ))}
                </div>
            )}

            {/* Full log toggle */}
            <button
                type="button"
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 hover:text-muted-foreground transition-colors pt-1"
                onClick={() => setShowFullLog(!showFullLog)}
            >
                <ChevronDown className={`h-3 w-3 transition-transform ${showFullLog ? 'rotate-180' : ''}`} />
                {showFullLog ? 'Hide full log' : 'Show full log'}
            </button>

            {showFullLog && (
                <div className="border border-border rounded-md overflow-hidden max-h-64 overflow-y-auto">
                    {grouped.map((item) =>
                        isActionGroup(item) ? (
                            <ActionBlock key={item.id} action={item} />
                        ) : (
                            <TextBlock key={item.id} log={item} />
                        )
                    )}
                </div>
            )}
        </div>
    )
}

/** Shorten path to just filename or last dir/filename */
function shortPath(p: string): string {
    const parts = p.split('/')
    if (parts.length <= 2) return p
    return parts.slice(-2).join('/')
}

function toolIcon(label: string): React.ReactNode {
    if (label.includes('Read') || label.includes('Search') || label.includes('List')) {
        return <FileText className="h-2.5 w-2.5" />
    }
    if (label.includes('Edit') || label.includes('Write')) {
        return <Pencil className="h-2.5 w-2.5" />
    }
    if (label.includes('command')) {
        return <Terminal className="h-2.5 w-2.5" />
    }
    return <Wrench className="h-2.5 w-2.5" />
}
