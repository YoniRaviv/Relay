import { useState, type ReactNode } from 'react'
import { X, ExternalLink, Ban, Trash2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRelayStore } from '@/store/useRelayStore'
import { formatCost, formatNumber } from '@/shared/formatters'
import type { JobColumns } from '@/shared/types/scheduler'
import { JobActivityFeed } from './JobActivityFeed'

function SectionLabel({ children }: { children: ReactNode }) {
    return (
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {children}
        </h3>
    )
}

export function JobDetail() {
    const jobColumns = useRelayStore((s) => s.jobColumns)
    const setJobColumns = useRelayStore((s) => s.setJobColumns)
    const selectedJobId = useRelayStore((s) => s.selectedJobId)
    const selectJob = useRelayStore((s) => s.selectJob)
    const [busy, setBusy] = useState(false)

    const job = Object.values(jobColumns).flat().find((j) => j.id === selectedJobId)
    if (!job) return null

    const refreshBoard = async () => {
        const columns = await window.relayAPI.scheduler.listJobs()
        setJobColumns(columns as unknown as JobColumns)
    }

    const handleCancel = async () => {
        setBusy(true)
        try {
            await window.relayAPI.scheduler.cancelJob(job.id)
            await refreshBoard()
        } finally {
            setBusy(false)
        }
    }

    const handleDelete = async () => {
        if (!window.confirm(`Delete "${job.name}"? This cannot be undone.`)) return
        setBusy(true)
        try {
            await window.relayAPI.scheduler.deleteJob(job.id)
            await refreshBoard()
            if (selectedJobId) selectJob(null)
        } finally {
            setBusy(false)
        }
    }

    const hasUsage = job.totalTokens != null || job.costUsd != null
    const isUrl = job.resultRef && /^https?:\/\//.test(job.resultRef)

    return (
        <div className="absolute right-0 top-0 w-[420px] bg-[var(--color-sidebar)] flex flex-col h-full overflow-hidden border-l border-border/50 shadow-xl z-20">
            <div className="px-5 pt-5 pb-4 border-b border-border/40">
                <div className="flex items-start justify-between gap-3">
                    <h2 className="text-[16px] font-semibold leading-snug min-w-0 truncate">{job.name}</h2>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 -mt-0.5" onClick={() => selectJob(null)}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>
                <div className="flex items-center gap-2 mt-2">
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {job.status.replace('_', ' ')}
                    </span>
                    {job.workingDir && (
                        <span className="text-[11px] font-mono text-muted-foreground truncate">{job.workingDir}</span>
                    )}
                </div>
                <div className="flex items-center gap-2 mt-3">
                    {job.status === 'running' && (
                        <Button size="sm" variant="outline" className="text-[13px]" onClick={handleCancel} disabled={busy}>
                            <Ban className="h-3.5 w-3.5 mr-1.5" />
                            Cancel
                        </Button>
                    )}
                    <Button size="sm" variant="outline" className="text-[13px]" disabled title="Coming in a later slice">
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                        Rerun
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="text-[13px] text-destructive hover:text-destructive"
                        onClick={handleDelete}
                        disabled={busy}
                    >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Delete
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-auto">
                <div className="px-5 py-4 border-b border-border/30">
                    <SectionLabel>Instructions</SectionLabel>
                    <p className="text-[13px] text-foreground leading-[1.7] mt-1.5 whitespace-pre-wrap">{job.instructions}</p>
                </div>

                {job.resultRef && (
                    <div className="px-5 py-4 border-b border-border/30">
                        <SectionLabel>Result</SectionLabel>
                        {isUrl ? (
                            <a
                                href={job.resultRef}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] text-primary hover:underline break-all"
                            >
                                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                {job.resultRef}
                            </a>
                        ) : (
                            <p className="mt-1.5 text-[13px] font-mono text-foreground/90 break-all">{job.resultRef}</p>
                        )}
                    </div>
                )}

                {job.failureReason && (
                    <div className="px-5 py-4 border-b border-border/30">
                        <SectionLabel>Failure Reason</SectionLabel>
                        <p className="text-[13px] text-rose-600 dark:text-rose-400 leading-relaxed mt-1.5">{job.failureReason}</p>
                    </div>
                )}

                {hasUsage && (
                    <div className="px-5 py-4 border-b border-border/30 flex items-center gap-4 text-[13px] text-muted-foreground">
                        {job.totalTokens != null && <span>{formatNumber(job.totalTokens)} tokens</span>}
                        {job.costUsd != null && <span>{formatCost(job.costUsd)}</span>}
                    </div>
                )}

                <div className="px-5 py-4">
                    <SectionLabel>Activity</SectionLabel>
                    <div className="mt-2">
                        <JobActivityFeed jobId={job.id} />
                    </div>
                </div>
            </div>
        </div>
    )
}
