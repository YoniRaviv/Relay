import { Clock } from 'lucide-react'
import { statusDots } from '@/shared/constants/statusMaps'
import { formatCost, formatNumber } from '@/shared/formatters'
import type { ScheduledJob } from '@/shared/types/scheduler'

interface JobCardProps {
    job: ScheduledJob
    onClick: () => void
}

// Scheduler-specific dots — 'done'/'failed' reuse the board's existing conventions.
const jobStatusDots: Record<string, string> = {
    backlog: 'bg-stone-400',
    queue: 'bg-sky-500',
    blocked: 'bg-sky-500',
    running: 'bg-teal-500 animate-pulse',
    needs_approval: 'bg-amber-500',
    done: statusDots.done,
    failed: statusDots.failed,
}

function basename(p: string): string {
    return p.replace(/\/+$/, '').split('/').pop() || p
}

export function JobCard({ job, onClick }: JobCardProps) {
    const isScheduled = !!job.scheduledFor && job.scheduledFor > Date.now()
    const hasUsage = job.totalTokens != null || job.costUsd != null

    return (
        <div
            onClick={onClick}
            className="p-3 rounded-lg bg-card border border-border/40 cursor-pointer transition-all shadow-sm hover:shadow-md"
        >
            <div className="flex items-center gap-2 mb-1.5">
                <p className="text-sm font-medium leading-tight truncate">{job.name}</p>
                <div className={`ml-auto w-2 h-2 rounded-full shrink-0 ${jobStatusDots[job.status] || 'bg-stone-400'}`} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
                {job.workingDir && (
                    <span className="text-[11px] font-mono text-muted-foreground truncate">
                        {basename(job.workingDir)}
                    </span>
                )}
                {isScheduled && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <Clock className="h-2.5 w-2.5" />
                        scheduled
                    </span>
                )}
            </div>
            {hasUsage && (
                <div className="mt-1.5 text-[11px] text-muted-foreground">
                    {job.totalTokens != null && `${formatNumber(job.totalTokens)} tok`}
                    {job.totalTokens != null && job.costUsd != null && ' · '}
                    {job.costUsd != null && formatCost(job.costUsd)}
                </div>
            )}
        </div>
    )
}
