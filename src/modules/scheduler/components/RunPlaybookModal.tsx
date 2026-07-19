import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Play, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Playbook } from '@/shared/types/scheduler'
import { RecurrencePicker } from './RecurrencePicker'

interface RunPlaybookModalProps {
    playbook: Playbook
    onClose: () => void
    onStarted: () => Promise<void> | void
}

const fieldClass =
    'w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring'

/** Instantiate a playbook into a job (or chain): pick where it runs and when. */
export function RunPlaybookModal({ playbook, onClose, onStarted }: RunPlaybookModalProps) {
    const multiStep = (playbook.steps?.length ?? 0) > 1
    const [instructions, setInstructions] = useState('')
    const [workingDir, setWorkingDir] = useState<string | null>(null)
    const [recentDirs, setRecentDirs] = useState<string[]>([])
    const [scheduledFor, setScheduledFor] = useState('')
    const [scheduleCron, setScheduleCron] = useState<string | null>(null)
    const [starting, setStarting] = useState(false)

    useEffect(() => {
        void window.relayAPI.scheduler.listWorkingDirs().then(setRecentDirs)
    }, [])

    const handlePickFolder = async () => {
        const dir = await window.relayAPI.selectFolder()
        if (dir) setWorkingDir(dir)
    }

    const handleRun = async () => {
        setStarting(true)
        try {
            await window.relayAPI.scheduler.playbooks.run(playbook.id, {
                instructions: instructions.trim() || undefined,
                workingDir,
                scheduledFor: scheduledFor ? new Date(scheduledFor).getTime() : null,
                scheduleCron,
            })
            await onStarted()
        } finally {
            setStarting(false)
        }
    }

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-[var(--color-sidebar)]">
                    <div className="flex items-center gap-2">
                        <Play className="h-4 w-4 text-muted-foreground" />
                        <h3 className="font-semibold text-sm">Run “{playbook.name}”</h3>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto min-h-0">
                    {!multiStep && (
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Instructions <span className="normal-case font-normal text-muted-foreground/70">(optional — overrides the playbook prompt)</span>
                            </label>
                            <textarea
                                value={instructions}
                                onChange={(e) => setInstructions(e.target.value)}
                                placeholder={playbook.prompt ?? ''}
                                className={`${fieldClass} h-20 resize-none`}
                            />
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Working Directory</label>
                        <button type="button" onClick={handlePickFolder} className={`${fieldClass} flex items-center gap-2 hover:bg-accent/50 transition-colors text-left`}>
                            <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className={workingDir ? 'truncate' : 'text-muted-foreground'}>{workingDir || 'Choose a folder…'}</span>
                        </button>
                        {recentDirs.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                                {recentDirs.map((dir) => (
                                    <button
                                        key={dir}
                                        type="button"
                                        onClick={() => setWorkingDir(dir)}
                                        className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground hover:text-foreground truncate max-w-[200px]"
                                        title={dir}
                                    >
                                        {dir.split('/').pop()}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Schedule For <span className="normal-case font-normal text-muted-foreground/70">(optional — empty runs now)</span>
                        </label>
                        <input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} className={fieldClass} />
                    </div>

                    {!multiStep && (
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Repeat <span className="normal-case font-normal text-muted-foreground/70">(re-arms after each run)</span>
                            </label>
                            <RecurrencePicker value={scheduleCron} onChange={setScheduleCron} />
                        </div>
                    )}
                    {multiStep && (
                        <p className="text-[12px] text-muted-foreground">
                            Runs as a {playbook.steps!.length}-step chain — each step starts when the previous one finishes.
                        </p>
                    )}
                </div>

                <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
                    <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
                    <Button size="sm" onClick={handleRun} disabled={starting}>
                        {scheduledFor || scheduleCron ? 'Schedule' : 'Run Now'}
                    </Button>
                </div>
            </div>
        </div>,
        document.body,
    )
}
