import { useCallback } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { KanbanColumn } from '@/components/KanbanColumn'
import { useRelayStore } from '@/store/useRelayStore'
import type { TaskStatus } from '@shared/types'

const COLUMNS: { id: string; title: string; statuses: TaskStatus[] }[] = [
  { id: 'pending', title: 'Pending', statuses: ['pending'] },
  { id: 'building', title: 'Building', statuses: ['in_progress', 'review', 'failed'] },
  { id: 'complete', title: 'Complete', statuses: ['done', 'approved'] },
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
    case 'complete': return 'done'
    default: return 'pending'
  }
}

export function KanbanBoard() {
  const { tasks, setTasks, setSelectedTaskId, currentTaskId } = useRelayStore()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const columnTasks = (columnId: string) => {
    const col = COLUMNS.find((c) => c.id === columnId)
    if (!col) return []
    return tasks
      .filter((t) => col.statuses.includes(t.status))
      .sort((a, b) => a.order - b.order)
  }

  const findTaskColumn = (taskId: string): string | undefined => {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return undefined
    return getColumnForStatus(task.status)
  }

  const handleDragOver = useCallback((_event: DragOverEvent) => {
    // Visual feedback is handled by useDroppable isOver
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over) return

      const activeId = active.id as string
      const overId = over.id as string

      const sourceColumn = findTaskColumn(activeId)
      // Determine target column: if we're over a column id directly, use it; otherwise find the task's column
      let targetColumn = COLUMNS.find((c) => c.id === overId)?.id ?? findTaskColumn(overId)

      if (!sourceColumn || !targetColumn) return

      const activeTask = tasks.find((t) => t.id === activeId)
      if (!activeTask) return

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
    [tasks, setTasks]
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
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
          />
        ))}
      </div>
    </DndContext>
  )
}
