import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Eye } from 'lucide-react'
import type { Task } from '@shared/types'

interface TaskCardProps {
  task: Task
  isActive?: boolean
  onClick: () => void
  onReview?: () => void
}

const priorityColors = {
  high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
}

const statusDots: Record<string, string> = {
  pending: 'bg-gray-400',
  in_progress: 'bg-blue-500 animate-pulse',
  review: 'bg-amber-500',
  failed: 'bg-red-500',
  done: 'bg-green-500',
  approved: 'bg-green-600',
}

export function TaskCard({ task, isActive, onClick, onReview }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`p-3 rounded-lg border bg-card cursor-pointer transition-shadow hover:shadow-md ${
        isDragging ? 'opacity-50 shadow-lg' : ''
      } ${isActive ? 'ring-2 ring-primary' : ''}`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-mono text-muted-foreground">{task.storyId}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded ${priorityColors[task.priority]}`}>
          {task.priority}
        </span>
        <div className={`ml-auto w-2 h-2 rounded-full ${statusDots[task.status] || 'bg-gray-400'}`} />
      </div>
      <p className="text-sm font-medium leading-tight">{task.title}</p>
      {task.status === 'review' && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onReview?.()
          }}
          className="inline-flex items-center gap-1 mt-1.5 text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
        >
          <Eye className="h-3 w-3" />
          Review
        </button>
      )}
    </div>
  )
}
