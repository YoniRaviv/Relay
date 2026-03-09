import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { TaskCard } from './TaskCard'
import { EmptyState } from '@/shared/components/EmptyState'
import type { Task } from '@shared/types'

interface KanbanColumnProps {
    id: string
    title: string
    tasks: Task[]
    activeTaskId?: string | null
    onTaskClick: (taskId: string) => void
    onTaskReview?: (taskId: string) => void
}

export function KanbanColumn({ id, title, tasks, activeTaskId, onTaskClick, onTaskReview }: KanbanColumnProps) {
    const { setNodeRef, isOver } = useDroppable({ id })
    const taskIds = tasks.map((t) => t.id)

    const isReview = id === 'review'

    return (
        <div className="flex flex-col flex-1 min-w-[260px] max-w-[380px]">
            <div className="flex items-center gap-2 mb-3 px-1">
                <h3 className="text-sm font-semibold">{title}</h3>
                {tasks.length > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        isReview ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium' : 'text-muted-foreground'
                    }`}>
                        {tasks.length}
                    </span>
                )}
            </div>
            <div
                ref={setNodeRef}
                className={`flex-1 p-2 rounded-lg transition-colors space-y-2 min-h-[200px] ${
                    isOver ? 'bg-primary/5' : ''
                }`}
            >
                <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
                    {tasks.length === 0 ? (
                        <EmptyState message={`No ${title.toLowerCase()} tasks`} />
                    ) : (
                        tasks.map((task) => (
                            <TaskCard
                                key={task.id}
                                task={task}
                                isActive={task.id === activeTaskId}
                                onClick={() => onTaskClick(task.id)}
                                onReview={() => onTaskReview?.(task.id)}
                            />
                        ))
                    )}
                </SortableContext>
            </div>
        </div>
    )
}
