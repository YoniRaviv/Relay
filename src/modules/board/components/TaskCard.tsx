import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Eye } from 'lucide-react'
import type { Task } from '@shared/types'
import { priorityTextColors, statusDots } from '@/shared/constants/statusMaps'

interface TaskCardProps {
    task: Task
    isActive?: boolean
    onClick: () => void
    onReview?: () => void
}

function TaskCardContent({ task }: { task: Task }) {
    return (
        <>
            <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-mono text-muted-foreground">{task.storyId}</span>
                <span className={`text-[11px] font-medium uppercase tracking-wide ${priorityTextColors[task.priority]}`}>
                    {task.priority}
                </span>
                <div className={`ml-auto w-2 h-2 rounded-full ${statusDots[task.status] || 'bg-stone-400'}`} />
            </div>
            <p className="text-sm font-medium leading-tight">{task.title}</p>
        </>
    )
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
            className={`p-3 rounded-lg bg-card cursor-pointer transition-all hover:shadow-sm ${
                isDragging ? 'opacity-0' : ''
            } ${isActive && task.status === 'in_progress'
                ? 'ring-2 ring-emerald-500 building-glow'
                : isActive
                    ? 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                    : ''
            } ${task.status === 'review' ? 'ring-1 ring-amber-500/40' : ''
            }`}
        >
            <TaskCardContent task={task} />
            {task.status === 'review' && (
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onReview?.()
                    }}
                    className="w-full mt-2.5 py-1.5 rounded-md text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 transition-colors flex items-center justify-center gap-1.5"
                >
                    <Eye className="h-3.5 w-3.5" />
                    Review Changes
                </button>
            )}
        </div>
    )
}

export function TaskCardOverlay({ task, isActive }: { task: Task; isActive?: boolean }) {
    return (
        <div
            className={`p-3 rounded-lg bg-card shadow-lg cursor-grabbing ${
                isActive ? 'ring-2 ring-primary' : ''
            }`}
            style={{ width: 'var(--card-width, auto)', rotate: '2deg' }}
        >
            <TaskCardContent task={task} />
        </div>
    )
}
