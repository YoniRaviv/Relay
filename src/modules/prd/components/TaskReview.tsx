import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import type { DecomposedTask } from '@/shared/types/prd'
import { TaskEditDialog } from './TaskEditDialog'
import { TaskReviewCard } from './TaskReviewCard'

interface TaskReviewProps {
    tasks: DecomposedTask[]
    onRemove: (index: number) => void
    onUpdate: (index: number, task: DecomposedTask) => void
    onConfirm: () => void
    onAddTask?: (task: DecomposedTask) => void
    loading: boolean
    manualMode?: boolean
}

const PRIORITY_ORDER = ['high', 'medium', 'low'] as const
const PRIORITY_LABELS: Record<string, string> = {
    high: 'High',
    medium: 'Medium',
    low: 'Low',
}

export function TaskReview({ tasks, onRemove, onUpdate, onConfirm, onAddTask, loading, manualMode }: TaskReviewProps) {
    const [editingIndex, setEditingIndex] = useState<number | null>(null)
    const [addingPriority, setAddingPriority] = useState<'high' | 'medium' | 'low' | null>(null)

    const grouped = PRIORITY_ORDER.map((priority) => ({
        priority,
        label: PRIORITY_LABELS[priority],
        tasks: tasks
            .map((task, originalIndex) => ({ task, originalIndex }))
            .filter(({ task }) => task.priority === priority),
    }))

    // In manual mode or when onAddTask is provided, always show all 3 columns
    // Otherwise only show columns that have tasks
    const visibleGroups = (manualMode || onAddTask)
        ? grouped
        : grouped.filter((group) => group.tasks.length > 0)

    return (
        <div className="space-y-6">
            <div className="flex gap-5 items-start">
                {visibleGroups.map((group) => (
                    <div key={group.priority} className="flex-1 min-w-0 flex flex-col">
                        <div className="flex items-center gap-2 mb-3 px-1">
                            <h3 className="text-sm font-semibold">{group.label}</h3>
                            <span className="text-xs text-muted-foreground">
                                {group.tasks.length}
                            </span>
                        </div>
                        <div className={`space-y-2 rounded-xl p-2.5 min-h-[120px] bg-[var(--color-column)]`}>
                            {group.tasks.length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center py-6">
                                    No {group.label.toLowerCase()} priority tasks
                                </p>
                            ) : (
                                group.tasks.map(({ task, originalIndex }) => (
                                    <TaskReviewCard
                                        key={`${task.storyId}-${originalIndex}`}
                                        task={task}
                                        onEdit={() => setEditingIndex(originalIndex)}
                                        onRemove={() => onRemove(originalIndex)}
                                    />
                                ))
                            )}
                            {onAddTask && (
                                <button
                                    onClick={() => setAddingPriority(group.priority)}
                                    className="w-full py-2 rounded-lg border border-dashed border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors flex items-center justify-center gap-1.5"
                                >
                                    <Plus className="h-3 w-3" />
                                    Add Task
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex items-center gap-4 pt-2 border-t border-border">
                <p className="text-sm text-muted-foreground">
                    {tasks.length} task{tasks.length !== 1 ? 's' : ''} ready to build
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

            {/* Add new task dialog */}
            {addingPriority && onAddTask && (
                <TaskEditDialog
                    task={{ storyId: '', title: '', description: '', acceptanceCriteria: '', priority: addingPriority }}
                    onSave={(task) => {
                        if (task.title.trim()) onAddTask(task)
                    }}
                    onClose={() => setAddingPriority(null)}
                />
            )}
        </div>
    )
}
