import { useEffect, useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Playbook } from '@/shared/types/scheduler'
import { PlaybookCard } from './PlaybookCard'
import { PlaybookModal } from './PlaybookModal'
import { RunPlaybookModal } from './RunPlaybookModal'

interface PlaybooksBarProps {
    onJobsChanged: () => Promise<void> | void
}

/** Collapsible strip of reusable playbooks above the job board. */
export function PlaybooksBar({ onJobsChanged }: PlaybooksBarProps) {
    const [playbooks, setPlaybooks] = useState<Playbook[]>([])
    const [expanded, setExpanded] = useState(true)
    const [editing, setEditing] = useState<Playbook | 'new' | null>(null)
    const [running, setRunning] = useState<Playbook | null>(null)

    const load = async () => setPlaybooks(await window.relayAPI.scheduler.playbooks.list())
    useEffect(() => { void load() }, [])

    const handleDelete = async (pb: Playbook) => {
        if (!window.confirm(`Delete playbook "${pb.name}"?`)) return
        await window.relayAPI.scheduler.playbooks.remove(pb.id)
        await load()
    }

    return (
        <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
                <button
                    type="button"
                    onClick={() => setExpanded((e) => !e)}
                    className="flex items-center gap-1.5 text-sm font-semibold tracking-tight hover:text-foreground/80"
                >
                    {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                    Playbooks
                    {playbooks.length > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full text-muted-foreground font-normal">{playbooks.length}</span>
                    )}
                </button>
                <Button size="sm" variant="ghost" className="h-7 text-[12px] ml-auto" onClick={() => setEditing('new')}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    New Playbook
                </Button>
            </div>
            {expanded && (
                <div className="flex gap-3 overflow-x-auto pb-1">
                    {playbooks.map((pb) => (
                        <PlaybookCard
                            key={pb.id}
                            playbook={pb}
                            onRun={() => setRunning(pb)}
                            onEdit={() => setEditing(pb)}
                            onDelete={() => void handleDelete(pb)}
                        />
                    ))}
                    {playbooks.length === 0 && (
                        <p className="text-[12px] text-muted-foreground py-2">No playbooks yet — create one to reuse a job setup.</p>
                    )}
                </div>
            )}
            {editing && (
                <PlaybookModal
                    playbook={editing === 'new' ? null : editing}
                    onClose={() => setEditing(null)}
                    onSaved={async () => { setEditing(null); await load() }}
                />
            )}
            {running && (
                <RunPlaybookModal
                    playbook={running}
                    onClose={() => setRunning(null)}
                    onStarted={async () => { setRunning(null); await onJobsChanged() }}
                />
            )}
        </div>
    )
}
