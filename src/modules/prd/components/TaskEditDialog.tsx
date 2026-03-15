import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { priorityBadgeColors } from '@/shared/constants/statusMaps'
import type { DecomposedTask } from '@/shared/types/prd'

const PRIORITY_ORDER = ['high', 'medium', 'low'] as const

export function TaskEditDialog({
    task,
    onSave,
    onClose,
}: {
    task: DecomposedTask
    onSave: (updated: DecomposedTask) => void
    onClose: () => void
}) {
    const [draft, setDraft] = useState(task)

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose()
    }, [onClose])

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [handleKeyDown])

    const handleSave = () => {
        onSave(draft)
        onClose()
    }

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            onClick={onClose}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-foreground/10 backdrop-blur-[2px] dialog-fade-in" />

            {/* Dialog */}
            <div
                className="relative w-full max-w-lg mx-4 bg-card rounded-xl shadow-xl border border-border dialog-pop-in"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4">
                    <div className="flex items-center gap-2.5">
                        <span className="text-xs font-mono text-muted-foreground">{task.storyId}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${priorityBadgeColors[task.priority]}`}>
                            {task.priority}
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 -m-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Fields */}
                <div className="px-6 pb-6 space-y-4">
                    <div>
                        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
                            Title
                        </label>
                        <input
                            className="w-full text-sm bg-background border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-shadow"
                            value={draft.title}
                            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                            autoFocus
                        />
                    </div>

                    <div>
                        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
                            Description
                        </label>
                        <textarea
                            className="w-full text-sm bg-background border border-input rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-shadow leading-relaxed"
                            value={draft.description}
                            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                            rows={4}
                        />
                    </div>

                    <div>
                        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
                            Acceptance Criteria
                        </label>
                        <textarea
                            className="w-full text-sm bg-background border border-input rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-shadow leading-relaxed"
                            value={draft.acceptanceCriteria}
                            onChange={(e) => setDraft({ ...draft, acceptanceCriteria: e.target.value })}
                            rows={4}
                            placeholder="Define what done looks like..."
                        />
                    </div>

                    <div>
                        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
                            Priority
                        </label>
                        <div className="flex gap-2">
                            {PRIORITY_ORDER.map((p) => (
                                <button
                                    key={p}
                                    onClick={() => setDraft({ ...draft, priority: p })}
                                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                                        draft.priority === p
                                            ? 'border-primary bg-primary/10 text-primary'
                                            : 'border-border text-muted-foreground hover:border-primary/40'
                                    }`}
                                >
                                    {p.charAt(0).toUpperCase() + p.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
                    <Button variant="outline" onClick={onClose} className="px-4">
                        Cancel
                    </Button>
                    <Button onClick={handleSave} className="px-6">
                        Save Changes
                    </Button>
                </div>
            </div>
        </div>,
        document.body,
    )
}
