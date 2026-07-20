import { JobColumn } from './JobColumn'
import type { JobColumns } from '@/shared/types/scheduler'

interface JobBoardProps {
    columns: JobColumns
}

const COLUMN_DEFS: Array<{ key: keyof JobColumns; title: string }> = [
    { key: 'backlog', title: 'Backlog' },
    { key: 'queue', title: 'Queued' },
    { key: 'running', title: 'Running' },
    { key: 'needs_approval', title: 'Needs Approval' },
    { key: 'done', title: 'Done' },
    { key: 'failed', title: 'Failed' },
]

export function JobBoard({ columns }: JobBoardProps) {
    return (
        <div className="flex flex-1 gap-4 overflow-x-auto">
            {COLUMN_DEFS.map(({ key, title }) => (
                <JobColumn key={key} title={title} jobs={columns[key]} />
            ))}
        </div>
    )
}
