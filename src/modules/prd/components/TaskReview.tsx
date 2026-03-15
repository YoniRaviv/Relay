import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { DecomposedTask } from '@/shared/types/prd'
import { TaskEditDialog } from './TaskEditDialog'
import { TaskReviewCard } from './TaskReviewCard'

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
