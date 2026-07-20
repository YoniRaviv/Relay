import { useEffect, useState } from 'react'
import { Plus, BarChart3, LayoutGrid, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRelayStore } from '@/store/useRelayStore'
import { useIpcListener } from '@/shared/hooks/useIpcListener'
import type { JobColumns } from '@/shared/types/scheduler'
import { JobBoard } from './JobBoard'
import { WeekView } from './WeekView'
import { JobDetail } from './JobDetail'
import { NewJobModal } from './NewJobModal'
import { KeepAwakeControl } from './KeepAwakeControl'
import { PlaybooksBar } from './PlaybooksBar'
import { UsagePanel } from './UsagePanel'

export function SchedulerView() {
    const jobColumns = useRelayStore((s) => s.jobColumns)
    const setJobColumns = useRelayStore((s) => s.setJobColumns)
    const selectedJobId = useRelayStore((s) => s.selectedJobId)
    const [mode, setMode] = useState<'board' | 'week'>('board')
    const [showNew, setShowNew] = useState(false)
    const [newJobAt, setNewJobAt] = useState<number | null>(null)
    const [showUsage, setShowUsage] = useState(false)

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
                    <div className="flex items-center rounded-md border border-border p-0.5">
                        <button
                            onClick={() => setMode('board')}
                            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded ${mode === 'board' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <LayoutGrid className="h-3.5 w-3.5" />
                            Board
                        </button>
                        <button
                            onClick={() => setMode('week')}
                            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded ${mode === 'week' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <CalendarDays className="h-3.5 w-3.5" />
                            Week
                        </button>
                    </div>
                    <KeepAwakeControl />
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setShowUsage(true)} title="Usage & cost">
                        <BarChart3 className="h-4 w-4" />
                    </Button>
                    <Button size="sm" className="gap-1.5" onClick={() => { setNewJobAt(null); setShowNew(true) }}>
                        <Plus className="h-4 w-4" />
                        New Job
                    </Button>
                </div>
            </header>
            <PlaybooksBar onJobsChanged={refresh} />
            {mode === 'board'
                ? <JobBoard columns={jobColumns} />
                : <WeekView onChanged={refresh} onCreateAt={(ms) => { setNewJobAt(ms); setShowNew(true) }} />}
            {selectedJobId && <JobDetail />}
            {showNew && (
                <NewJobModal initialScheduledFor={newJobAt} onClose={() => { setShowNew(false); void refresh() }} />
            )}
            {showUsage && <UsagePanel onClose={() => setShowUsage(false)} />}
        </div>
    )
}
