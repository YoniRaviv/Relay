import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Trash2, Pencil, X } from 'lucide-react'
import { priorityTextColors, priorityBadgeColors } from '@/shared/constants/statusMaps'
import type { DecomposedTask } from '@/shared/types/prd'

interface TaskReviewProps {
    tasks: DecomposedTask[]
    onRemove: (index: number) => void
    onUpdate: (index: number, task: DecomposedTask) => void
    onConfirm: () => void
    loading: boolean
}

const PRIORITY_ORDER = ['high', 'medium', 'low'] as const
const PRIORITY_LABELS: Record<string, string> = {
    high: 'High',
    medium: 'Medium',
    low: 'Low',
}

/* ── Edit Dialog (portalled to body) ── */

function TaskEditDialog({
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

/* ── Task Card ── */

function TaskReviewCard({
    task,
    onEdit,
    onRemove,
}: {
    task: DecomposedTask
    onEdit: () => void
    onRemove: () => void
}) {
    return (
        <div
            className="group p-3 rounded-lg bg-card hover:shadow-sm transition-all cursor-pointer"
            onClick={onEdit}
        >
            <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-mono text-muted-foreground">{task.storyId}</span>
                <span className={`text-[11px] font-medium uppercase tracking-wide ${priorityTextColors[task.priority]}`}>
                    {task.priority}
                </span>
                <div className="ml-auto flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={(e) => { e.stopPropagation(); onEdit() }}
                        className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
                    >
                        <Pencil className="h-3 w-3" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onRemove() }}
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    >
                        <Trash2 className="h-3 w-3" />
                    </button>
                </div>
            </div>
            <p className="text-sm font-medium leading-tight">{task.title}</p>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{task.description}</p>
        </div>
    )
}

/* ── Main Component ── */

export function TaskReview({ tasks, onRemove, onUpdate, onConfirm, loading }: TaskReviewProps) {
    const [editingIndex, setEditingIndex] = useState<number | null>(null)

    const grouped = PRIORITY_ORDER.map((priority) => ({
        priority,
        label: PRIORITY_LABELS[priority],
        tasks: tasks
            .map((task, originalIndex) => ({ task, originalIndex }))
            .filter(({ task }) => task.priority === priority),
    })).filter((group) => group.tasks.length > 0)

    return (
        <div className="space-y-6">
            <div className="flex gap-5 items-start">
                {grouped.map((group) => (
                    <div key={group.priority} className="flex-1 min-w-0 flex flex-col">
                        <div className="flex items-center gap-2 mb-3 px-1">
                            <h3 className="text-sm font-semibold">{group.label}</h3>
                            <span className="text-xs text-muted-foreground">
                                {group.tasks.length}
                            </span>
                        </div>
                        <div className="space-y-2">
                            {group.tasks.map(({ task, originalIndex }) => (
                                <TaskReviewCard
                                    key={`${task.storyId}-${originalIndex}`}
                                    task={task}
                                    onEdit={() => setEditingIndex(originalIndex)}
                                    onRemove={() => onRemove(originalIndex)}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex items-center gap-4 pt-2 border-t border-border">
                <p className="text-sm text-muted-foreground">
                    {tasks.length} tasks ready to build
                </p>
                <Button onClick={onConfirm} disabled={tasks.length === 0 || loading} className="ml-auto px-8">
                    {loading ? 'Saving...' : 'Start Building'}
                </Button>
            </div>

            {/* Edit dialog */}
            {editingIndex !== null && tasks[editingIndex] && (
                <TaskEditDialog
                    task={tasks[editingIndex]}
                    onSave={(updated) => onUpdate(editingIndex, updated)}
                    onClose={() => setEditingIndex(null)}
                />
            )}
        </div>
    )
}
