import { useEffect, useState } from 'react'
import { formatCost, formatDuration, formatNumber } from '@/shared/formatters'
import type { JobRun, JobStatus } from '@/shared/types/scheduler'

interface RunHistoryListProps {
    jobId: string
    jobStatus: JobStatus
}

const runDots: Record<JobRun['status'], string> = {
    running: 'bg-teal-500 animate-pulse',
    done: 'bg-emerald-500',
    needs_approval: 'bg-amber-500',
    failed: 'bg-rose-500',
    cancelled: 'bg-stone-400',
}

/** The job's most recent runs (newest first). Refetches when the job's status changes. */
export function RunHistoryList({ jobId, jobStatus }: RunHistoryListProps) {
    const [runs, setRuns] = useState<JobRun[]>([])

    useEffect(() => {
        void window.relayAPI.scheduler.getRuns(jobId).then(setRuns)
    }, [jobId, jobStatus])

    if (runs.length === 0) return null

    return (
        <div className="space-y-1.5">
            {runs.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${runDots[r.status]}`} />
                    <span className="text-foreground/90">{new Date(r.startedAt).toLocaleString()}</span>
                    {r.finishedAt != null && <span>{formatDuration(r.finishedAt - r.startedAt)}</span>}
                    <span className="ml-auto flex items-center gap-2">
                        {r.totalTokens != null && <span>{formatNumber(r.totalTokens)} tok</span>}
                        {r.costUsd != null && <span>{formatCost(r.costUsd)}</span>}
                    </span>
                </div>
            ))}
        </div>
    )
}
