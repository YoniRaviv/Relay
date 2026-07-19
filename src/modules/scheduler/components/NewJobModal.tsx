import { useState } from 'react'
import { X, FolderOpen, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { OutputType } from '@/shared/types/scheduler'

interface NewJobModalProps {
    onClose: () => void
}

const OUTPUT_TYPES: Array<{ value: OutputType; label: string }> = [
    { value: 'md', label: 'Markdown doc' },
    { value: 'pr', label: 'Pull request' },
    { value: 'artifact', label: 'Artifact' },
]

// Claude Code CLI model aliases (electron/scheduler/types.ts RunProfile.model) — not the
// AVAILABLE_MODELS pricing ids used elsewhere in the app.
const MODEL_OPTIONS: Array<{ value: string; label: string }> = [
    { value: '', label: 'Default' },
    { value: 'haiku', label: 'Haiku' },
    { value: 'sonnet', label: 'Sonnet' },
    { value: 'opus', label: 'Opus' },
]

export function NewJobModal({ onClose }: NewJobModalProps) {
    const [name, setName] = useState('')
    const [instructions, setInstructions] = useState('')
    const [workingDir, setWorkingDir] = useState<string | null>(null)
    const [outputType, setOutputType] = useState<OutputType>('md')
    const [model, setModel] = useState('')
    const [scheduledFor, setScheduledFor] = useState('')
    const [submitting, setSubmitting] = useState(false)

    const canSubmit = name.trim().length > 0 && instructions.trim().length > 0 && !submitting

    const handlePickFolder = async () => {
        const dir = await window.relayAPI.selectFolder()
        if (dir) setWorkingDir(dir)
    }

    const handleSubmit = async () => {
        if (!canSubmit) return
        setSubmitting(true)
        try {
            await window.relayAPI.scheduler.createJob({
                name: name.trim(),
                instructions: instructions.trim(),
                outputType,
                workingDir,
                model: model || null,
                scheduledFor: scheduledFor ? new Date(scheduledFor).getTime() : null,
            })
            onClose()
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
                <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-[var(--color-sidebar)]">
                    <div className="flex items-center gap-2">
                        <Rocket className="h-4 w-4 text-muted-foreground" />
                        <h3 className="font-semibold text-sm">New Job</h3>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Vault research smoke"
                            className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                            autoFocus
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Instructions</label>
                        <textarea
                            value={instructions}
                            onChange={(e) => setInstructions(e.target.value)}
                            placeholder="Write a one-paragraph note about X to note.md"
                            className="w-full h-24 px-3 py-2 text-sm rounded-md border border-border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Working Directory</label>
                        <button
                            type="button"
                            onClick={handlePickFolder}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-border bg-background hover:bg-accent/50 transition-colors"
                        >
                            <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className={workingDir ? 'truncate' : 'text-muted-foreground'}>
                                {workingDir || 'Choose a folder…'}
                            </span>
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Output Type</label>
                            <select
                                value={outputType}
                                onChange={(e) => setOutputType(e.target.value as OutputType)}
                                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                                {OUTPUT_TYPES.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Model</label>
                            <select
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                                {MODEL_OPTIONS.map((m) => (
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Schedule For <span className="normal-case font-normal text-muted-foreground/70">(optional — empty runs now)</span>
                        </label>
                        <input
                            type="datetime-local"
                            value={scheduledFor}
                            onChange={(e) => setScheduledFor(e.target.value)}
                            className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
                    <Button variant="outline" size="sm" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
                        {scheduledFor ? 'Schedule' : 'Run Now'}
                    </Button>
                </div>
            </div>
        </div>
    )
}
