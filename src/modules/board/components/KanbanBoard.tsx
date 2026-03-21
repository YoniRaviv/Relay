import { useCallback, useMemo, useState, useEffect } from 'react'
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
import { TaskEditDialog } from '@/modules/prd/components/TaskEditDialog'
import { Button } from '@/components/ui/button'
import { Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useRelayStore } from '@/store/useRelayStore'
import type { Task, TaskStatus } from '@shared/types'
import type { DecomposedTask } from '@/shared/types/prd'

const ALL_COLUMNS: { id: string; title: string; statuses: TaskStatus[] }[] = [
    { id: 'pending', title: 'Pending', statuses: ['pending'] },
    { id: 'building', title: 'Building', statuses: ['in_progress', 'failed'] },
    { id: 'review', title: 'Human Review', statuses: ['review'] },
    { id: 'complete', title: 'Complete', statuses: ['done'] },
]

function getColumnForStatus(status: TaskStatus, columns: typeof ALL_COLUMNS): string {
    for (const col of columns) {
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
    const activeProject = useRelayStore((s) => s.activeProject)
    const activePrdId = useRelayStore((s) => s.activePrdId)
    const buildMode = useRelayStore((s) => s.buildMode)

    const columns = useMemo(() =>
        buildMode === 'auto-pilot'
            ? ALL_COLUMNS.filter((c) => c.id !== 'review')
            : ALL_COLUMNS,
    [buildMode])
    const [activeTask, setActiveTask] = useState<Task | null>(null)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [showAddTask, setShowAddTask] = useState(false)
    const isSelecting = selectedIds.size > 0

    // Clear selection when tasks change (e.g. after bulk delete)
    useEffect(() => { setSelectedIds(new Set()) }, [tasks])

    const toggleSelect = useCallback((taskId: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(taskId)) next.delete(taskId)
            else next.add(taskId)
            return next
        })
    }, [])

    const handleBulkDelete = useCallback(async () => {
        if (!window.confirm(`Delete ${selectedIds.size} task(s)? This cannot be undone.`)) return
        for (const id of selectedIds) {
            await window.relayAPI.deleteTask(id)
        }
        setTasks(tasks.filter(t => !selectedIds.has(t.id)))
        setSelectedIds(new Set())
        toast.success(`Deleted ${selectedIds.size} tasks`)
    }, [selectedIds, tasks, setTasks])

    const handleAddTask = useCallback(async (task: DecomposedTask) => {
        if (!activeProject || !activePrdId) return
        try {
            const { task: created } = await window.relayAPI.createTask({
                projectId: activeProject.id,
                prdId: activePrdId,
                title: task.title,
                description: task.description,
                acceptanceCriteria: task.acceptanceCriteria,
                priority: task.priority,
            })
            setTasks([...tasks, created])
            toast.success('Task added')
        } catch {
            toast.error('Failed to add task')
        }
    }, [activeProject, activePrdId, tasks, setTasks])

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    )

    // Memoize per-column task lists — only recomputes when tasks array or columns change
    const tasksByColumn = useMemo(() => {
        const map: Record<string, Task[]> = {}
        for (const col of columns) {
            map[col.id] = tasks
                .filter((t) => col.statuses.includes(t.status))
                .sort((a, b) => a.order - b.order)
        }
        return map
    }, [tasks, columns])

    const columnTasks = (columnId: string) => tasksByColumn[columnId] ?? []

    const findTaskColumn = (taskId: string): string | undefined => {
        const task = tasks.find((t) => t.id === taskId)
        if (!task) return undefined
        return getColumnForStatus(task.status, columns)
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
            const targetColumn = columns.find((c) => c.id === overId)?.id ?? findTaskColumn(overId)

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
        [tasks, setTasks, columns] // eslint-disable-line react-hooks/exhaustive-deps
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
            {/* Bulk action bar */}
            {isSelecting && (
                <div className="flex items-center gap-3 px-6 py-2 bg-muted/50 border-b border-border">
                    <span className="text-xs font-medium">{selectedIds.size} selected</span>
                    <Button size="sm" variant="destructive" className="h-6 gap-1 text-xs" onClick={handleBulkDelete}>
                        <Trash2 className="h-3 w-3" />
                        Delete
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 gap-1 text-xs" onClick={() => setSelectedIds(new Set())}>
                        <X className="h-3 w-3" />
                        Clear
                    </Button>
                </div>
            )}
            <div className="flex gap-4 p-6 h-full overflow-x-auto">
                {columns.map((col) => (
                    <KanbanColumn
                        key={col.id}
                        id={col.id}
                        title={col.title}
                        tasks={columnTasks(col.id)}
                        activeTaskId={currentTaskId}
                        onTaskClick={isSelecting ? toggleSelect : setSelectedTaskId}
                        onTaskReview={setReviewingTaskId}
                        onAddTask={col.id === 'pending' ? () => setShowAddTask(true) : undefined}
                        selectedIds={selectedIds}
                        onToggleSelect={toggleSelect}
                    />
                ))}
            </div>
            <DragOverlay dropAnimation={{ duration: 200, easing: 'ease' }}>
                {activeTask ? (
                    <TaskCardOverlay task={activeTask} isActive={activeTask.id === currentTaskId} />
                ) : null}
            </DragOverlay>

            {showAddTask && (
                <TaskEditDialog
                    task={{ storyId: '', title: '', description: '', acceptanceCriteria: '', priority: 'medium' }}
                    onSave={(task) => { if (task.title.trim()) handleAddTask(task) }}
                    onClose={() => setShowAddTask(false)}
                />
            )}
        </DndContext>
    )
}
