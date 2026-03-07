import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { TaskCard } from '@/components/TaskCard'
import { EmptyState } from '@/components/EmptyState'
import type { Task } from '@shared/types'

interface KanbanColumnProps {
  id: string
  title: string
  tasks: Task[]
  activeTaskId?: string | null
  onTaskClick: (taskId: string) => void
}

export function KanbanColumn({ id, title, tasks, activeTaskId, onTaskClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id })
  const taskIds = tasks.map((t) => t.id)

  return (
    <div className="flex flex-col flex-1 min-w-[280px] max-w-[400px]">
      <div className="flex items-center gap-2 mb-3 px-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
          {tasks.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 p-2 rounded-lg bg-muted/40 border border-dashed transition-colors space-y-2 min-h-[200px] ${
          isOver ? 'border-primary bg-primary/5' : 'border-transparent'
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
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  )
}
