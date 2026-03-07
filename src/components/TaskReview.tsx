import { Button } from '@/components/ui/button'
import { Trash2, GripVertical } from 'lucide-react'

interface TaskItem {
  storyId: string
  title: string
  description: string
  acceptanceCriteria: string
  priority: 'high' | 'medium' | 'low'
}

interface TaskReviewProps {
  tasks: TaskItem[]
  onRemove: (index: number) => void
  onConfirm: () => void
  loading: boolean
}

const priorityColors = {
  high: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  low: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
}

export function TaskReview({ tasks, onRemove, onConfirm, loading }: TaskReviewProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2 max-h-[400px] overflow-auto">
        {tasks.map((task, i) => (
          <div
            key={`${task.storyId}-${i}`}
            className="flex items-start gap-2 p-3 border rounded-md bg-card"
          >
            <GripVertical className="h-4 w-4 mt-1 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-muted-foreground">{task.storyId}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${priorityColors[task.priority]}`}>
                  {task.priority}
                </span>
              </div>
              <p className="text-sm font-medium">{task.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => onRemove(i)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground text-center">
        {tasks.length} tasks ready to build
      </p>
      <Button onClick={onConfirm} disabled={tasks.length === 0 || loading} className="w-full">
        {loading ? 'Saving...' : 'Start Building'}
      </Button>
    </div>
  )
}
