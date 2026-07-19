import { EmptyState } from '@/shared/components/EmptyState'
import { useRelayStore } from '@/store/useRelayStore'
import type { ScheduledJob } from '@/shared/types/scheduler'
import { JobCard } from './JobCard'

interface JobColumnProps {
    title: string
    jobs: ScheduledJob[]
}

export function JobColumn({ title, jobs }: JobColumnProps) {
    const selectJob = useRelayStore((s) => s.selectJob)

    return (
        <div className="flex flex-col flex-1 min-w-[240px]">
            <div className="flex items-center gap-2 mb-3 px-3">
                <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
                {jobs.length > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full text-muted-foreground">
                        {jobs.length}
                    </span>
                )}
            </div>
            <div className="flex-1 p-2.5 rounded-xl space-y-2 min-h-[200px] overflow-y-auto bg-[var(--color-column)]">
                {jobs.length === 0 ? (
                    <EmptyState message={`No ${title.toLowerCase()} jobs`} />
                ) : (
                    jobs.map((job) => (
                        <JobCard key={job.id} job={job} onClick={() => selectJob(job.id)} />
                    ))
                )}
            </div>
        </div>
    )
}
