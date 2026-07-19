import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRelayStore } from '@/store/useRelayStore'
import { useIpcListener } from '@/shared/hooks/useIpcListener'
import type { JobColumns } from '@/shared/types/scheduler'
import { JobBoard } from './JobBoard'
import { JobDetail } from './JobDetail'
import { NewJobModal } from './NewJobModal'
import { KeepAwakeControl } from './KeepAwakeControl'
import { PlaybooksBar } from './PlaybooksBar'

export function SchedulerView() {
    const jobColumns = useRelayStore((s) => s.jobColumns)
    const setJobColumns = useRelayStore((s) => s.setJobColumns)
    const selectedJobId = useRelayStore((s) => s.selectedJobId)
    const [showNew, setShowNew] = useState(false)

    const refresh = async () => {
        const columns = await window.relayAPI.scheduler.listJobs()
        setJobColumns(columns as unknown as JobColumns)
    }

    useEffect(() => { void refresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps
    useIpcListener('scheduler:jobUpdated', () => { void refresh() }, [])

    return (
        <div className="flex h-full flex-col p-6 relative">
            <header className="mb-4 flex items-center justify-between">
                <h1 className="text-xl font-semibold text-foreground">Scheduler</h1>
                <div className="flex items-center gap-3">
                    <KeepAwakeControl />
                    <Button size="sm" className="gap-1.5" onClick={() => setShowNew(true)}>
                        <Plus className="h-4 w-4" />
                        New Job
                    </Button>
                </div>
            </header>
            <PlaybooksBar onJobsChanged={refresh} />
            <JobBoard columns={jobColumns} />
            {selectedJobId && <JobDetail />}
            {showNew && (
                <NewJobModal onClose={() => { setShowNew(false); void refresh() }} />
            )}
        </div>
    )
}
