import { useCallback, useMemo, useState } from 'react'
import {
    DndContext,
    DragEndEvent,
    DragStartEvent,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    closestCorners,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { KanbanColumn } from './KanbanColumn'
import { TaskCardOverlay } from './TaskCard'
import { useRelayStore } from '@/store/useRelayStore'
import type { Task, TaskStatus } from '@shared/types'

const COLUMNS: { id: string; title: string; statuses: TaskStatus[] }[] = [
    { id: 'pending', title: 'Pending', statuses: ['pending'] },
    { id: 'building', title: 'Building', statuses: ['in_progress', 'failed'] },
    { id: 'review', title: 'Human Review', statuses: ['review'] },
    { id: 'complete', title: 'Complete', statuses: ['done'] },
]

function getColumnForStatus(status: TaskStatus): string {
    for (const col of COLUMNS) {
        if (col.statuses.includes(status)) return col.id
    }
    return 'pending'
}

function getDefaultStatusForColumn(columnId: string): TaskStatus {
    switch (columnId) {
        case 'building': return 'in_progress'
        case 'review': return 'review'
        case 'complete': return 'done'
        default: return 'pending'
    }
}

export function KanbanBoard() {
    const tasks = useRelayStore((s) => s.tasks)
    const setTasks = useRelayStore((s) => s.setTasks)
    const setSelectedTaskId = useRelayStore((s) => s.setSelectedTaskId)
    const currentTaskId = useRelayStore((s) => s.currentTaskId)
    const setReviewingTaskId = useRelayStore((s) => s.setReviewingTaskId)
    const [activeTask, setActiveTask] = useState<Task | null>(null)

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    )

    // Memoize per-column task lists — only recomputes when tasks array changes
    const tasksByColumn = useMemo(() => {
        const map: Record<string, Task[]> = {}
        for (const col of COLUMNS) {
            map[col.id] = tasks
                .filter((t) => col.statuses.includes(t.status))
                .sort((a, b) => a.order - b.order)
        }
        return map
    }, [tasks])

    const columnTasks = (columnId: string) => tasksByColumn[columnId] ?? []

    const findTaskColumn = (taskId: string): string | undefined => {
        const task = tasks.find((t) => t.id === taskId)
        if (!task) return undefined
        return getColumnForStatus(task.status)
    }

    const handleDragStart = useCallback(
        (event: DragStartEvent) => {
            const task = tasks.find((t) => t.id === event.active.id)
            setActiveTask(task ?? null)
        },
        [tasks]
    )

    const handleDragOver = useCallback(() => {
        // Visual feedback is handled by useDroppable isOver
    }, [])

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            setActiveTask(null)
            const { active, over } = event
            if (!over) return

            const activeId = active.id as string
            const overId = over.id as string

            const sourceColumn = findTaskColumn(activeId)
            // Determine target column: if we're over a column id directly, use it; otherwise find the task's column
            const targetColumn = COLUMNS.find((c) => c.id === overId)?.id ?? findTaskColumn(overId)

            if (!sourceColumn || !targetColumn) return

            const activeTaskItem = tasks.find((t) => t.id === activeId)
            if (!activeTaskItem) return

            let newTasks = [...tasks]

            if (sourceColumn !== targetColumn) {
                // Moving to a different column — update status
                const newStatus = getDefaultStatusForColumn(targetColumn)
                newTasks = newTasks.map((t) =>
                    t.id === activeId ? { ...t, status: newStatus } : t
                )
                window.relayAPI.updateTask(activeId, { status: newStatus })
            } else if (activeId !== overId) {
                // Reordering within column
                const colTasks = columnTasks(sourceColumn)
                const oldIndex = colTasks.findIndex((t) => t.id === activeId)
                const newIndex = colTasks.findIndex((t) => t.id === overId)
                if (oldIndex !== -1 && newIndex !== -1) {
                    const reordered = arrayMove(colTasks, oldIndex, newIndex)
                    const orderUpdates = reordered.map((t, i) => ({ id: t.id, order: i }))

                    newTasks = newTasks.map((t) => {
                        const update = orderUpdates.find((o) => o.id === t.id)
                        return update ? { ...t, order: update.order } : t
                    })

                    window.relayAPI.reorderTasks(orderUpdates)
                }
            }

            setTasks(newTasks)
        },
        [tasks, setTasks] // eslint-disable-line react-hooks/exhaustive-deps
    )

    const handleDragCancel = useCallback(() => {
        setActiveTask(null)
    }, [])

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            <div className="flex gap-4 p-6 h-full overflow-x-auto">
                {COLUMNS.map((col) => (
                    <KanbanColumn
                        key={col.id}
                        id={col.id}
                        title={col.title}
                        tasks={columnTasks(col.id)}
                        activeTaskId={currentTaskId}
                        onTaskClick={setSelectedTaskId}
                        onTaskReview={setReviewingTaskId}
                    />
                ))}
            </div>
            <DragOverlay dropAnimation={{ duration: 200, easing: 'ease' }}>
                {activeTask ? (
                    <TaskCardOverlay task={activeTask} isActive={activeTask.id === currentTaskId} />
                ) : null}
            </DragOverlay>
        </DndContext>
    )
}
