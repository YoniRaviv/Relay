import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Eye, Pause } from 'lucide-react'
import type { Task } from '@shared/types'
import { priorityTextColors, statusDots } from '@/shared/constants/statusMaps'
import { useRelayStore } from '@/store/useRelayStore'

interface TaskCardProps {
    task: Task
    isActive?: boolean
    isSelected?: boolean
    onClick: () => void
    onReview?: () => void
    onShiftClick?: () => void
}

function TaskCardContent({ task, isPaused }: { task: Task; isPaused?: boolean }) {
    return (
        <>
            <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-mono text-muted-foreground">{task.storyId}</span>
                <span className={`text-[11px] font-medium uppercase tracking-wide ${priorityTextColors[task.priority]}`}>
                    {task.priority}
                </span>
                {isPaused ? (
                    <Pause className="ml-auto h-3 w-3 text-amber-500" />
                ) : (
                    <div className={`ml-auto w-2 h-2 rounded-full ${statusDots[task.status] || 'bg-stone-400'}`} />
                )}
            </div>
            <p className="text-sm font-medium leading-tight">{task.title}</p>
        </>
    )
}

export const TaskCard = React.memo(function TaskCard({ task, isActive, isSelected, onClick, onReview, onShiftClick }: TaskCardProps) {
    const loopState = useRelayStore((s) => s.loopState)
    const isPausedInProgress = task.status === 'in_progress' && loopState === 'paused'
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
            onClick={(e) => {
                if (e.shiftKey && onShiftClick) {
                    e.preventDefault()
                    onShiftClick()
                } else {
                    onClick()
                }
            }}
            className={`p-3 rounded-lg bg-card border border-border/40 cursor-pointer transition-all shadow-sm hover:shadow-md ${
                isDragging ? 'opacity-0' : ''
            } ${isSelected
                ? 'ring-2 ring-primary bg-primary/5'
                : isActive && task.status === 'in_progress' && !isPausedInProgress
                    ? 'ring-2 ring-emerald-500 building-glow'
                    : isPausedInProgress
                        ? 'ring-2 ring-amber-500/60'
                        : isActive && task.status === 'in_progress'
                            ? 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                            : ''
            } ${task.status === 'review' && !isSelected ? 'ring-1 ring-stone-400 dark:ring-amber-500/40' : ''
            }`}
        >
            <TaskCardContent task={task} isPaused={isPausedInProgress} />
            {task.status === 'failed' && task.rejectionNotes && (
                <div className="mt-2 px-2 py-1.5 rounded-md bg-rose-500/10 border border-rose-500/20">
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 line-clamp-2">{task.rejectionNotes}</p>
                </div>
            )}
            {task.status === 'review' && (
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onReview?.()
                    }}
                    className="w-full mt-2.5 py-1.5 rounded-md text-xs font-semibold bg-stone-500/15 text-stone-700 dark:bg-amber-500/15 dark:text-amber-400 hover:bg-stone-500/25 dark:hover:bg-amber-500/25 transition-colors flex items-center justify-center gap-1.5"
                >
                    <Eye className="h-3.5 w-3.5" />
                    Review Changes
                </button>
            )}
        </div>
    )
})

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
