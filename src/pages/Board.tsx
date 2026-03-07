import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AppShell } from '@/components/AppShell'
import { ProjectSidebar, type SidebarView } from '@/components/ProjectSidebar'
import { KanbanBoard } from '@/components/KanbanBoard'
import { TaskDetail } from '@/components/TaskDetail'
import { LoopControls } from '@/components/LoopControls'
import { AgentActivityFeed } from '@/components/AgentActivityFeed'
import { ReviewPanel } from '@/components/ReviewPanel'
import { Summary } from '@/pages/Summary'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { BoardSkeleton } from '@/components/LoadingSkeleton'
import { useKeyboardShortcuts } from '@/lib/shortcuts'
import { useRelayStore } from '@/store/useRelayStore'
import type { Task, TaskLog, LoopState } from '@shared/types'

interface BoardProps {
  onSwitchProject: () => void
}

export function Board({ onSwitchProject }: BoardProps) {
  const {
    activeProject, tasks, setTasks, selectedTaskId, prdMarkdown,
    setLoopState, setCurrentTaskId, addActivity,
    reviewingTaskId, setReviewingTaskId,
  } = useRelayStore()
  const [sidebarView, setSidebarView] = useState<SidebarView>('board')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (activeProject) {
      setLoading(true)
      window.relayAPI.listTasks(activeProject.id)
        .then(setTasks)
        .catch(() => toast.error('Failed to load tasks'))
        .finally(() => setLoading(false))
    }
  }, [activeProject, setTasks])

  // Keyboard shortcuts
  const toggleLoop = () => {
    const { loopState } = useRelayStore.getState()
    if (!activeProject) return
    if (loopState === 'idle' || loopState === 'stopped') {
      useRelayStore.getState().clearActivity()
      useRelayStore.getState().setLoopState('running')
      window.relayAPI.startLoop(activeProject.id)
    } else if (loopState === 'running') {
      useRelayStore.getState().setLoopState('paused')
      window.relayAPI.pauseLoop()
    } else if (loopState === 'paused') {
      useRelayStore.getState().setLoopState('running')
      window.relayAPI.resumeLoop()
    }
  }

  const closePanel = () => {
    const store = useRelayStore.getState()
    if (store.reviewingTaskId) store.setReviewingTaskId(null)
    else if (store.selectedTaskId) store.setSelectedTaskId(null)
  }

  useKeyboardShortcuts({ onToggleLoop: toggleLoop, onClosePanel: closePanel })

  // Listen for agent loop events
  useEffect(() => {
    const removeActivity = window.relayAPI.on('agent:activity', (data: unknown) => {
      addActivity(data as TaskLog)
    })

    const removeStateChange = window.relayAPI.on('loop:stateChange', (data: unknown) => {
      const { state } = data as { state: LoopState }
      setLoopState(state)
    })

    const removeTaskChange = window.relayAPI.on('loop:taskChange', (data: unknown) => {
      const { taskId } = data as { taskId: string | null }
      setCurrentTaskId(taskId)
    })

    const removeTasksUpdated = window.relayAPI.on('loop:tasksUpdated', (data: unknown) => {
      setTasks(data as Task[])
    })

    const removeError = window.relayAPI.on('agent:error', (data: unknown) => {
      const { message } = data as { message: string }
      toast.error('Agent error', { description: message })
    })

    const removeTaskDone = window.relayAPI.on('loop:taskDone', (data: unknown) => {
      const { storyId } = data as { storyId: string }
      toast.success(`${storyId} ready for review`)
    })

    return () => {
      removeActivity()
      removeStateChange()
      removeTaskChange()
      removeTasksUpdated()
      removeError()
      removeTaskDone()
    }
  }, [addActivity, setLoopState, setCurrentTaskId, setTasks])

  // Update window title
  useEffect(() => {
    const { currentTaskId } = useRelayStore.getState()
    const task = tasks.find(t => t.id === currentTaskId)
    const suffix = task ? ` — Building ${task.storyId}` : ''
    document.title = `Relay — ${activeProject?.name ?? ''}${suffix}`
    return () => { document.title = 'Relay' }
  }, [activeProject, tasks])

  if (!activeProject) return null

  return (
    <AppShell
      sidebar={
        <ProjectSidebar
          projectName={activeProject.name}
          activeView={sidebarView}
          onViewChange={setSidebarView}
        />
      }
    >
      <div className="flex flex-col h-full">
        {/* Header with loop controls */}
        {sidebarView === 'board' && (
          <div className="flex items-center justify-between px-6 py-3 border-b">
            <h2 className="text-sm font-semibold">Kanban Board</h2>
            <LoopControls />
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            {sidebarView === 'board' && (
              <ErrorBoundary fallbackMessage="The board encountered an error.">
                {loading ? (
                  <BoardSkeleton />
                ) : (
                  <>
                    <div className="flex-1 overflow-hidden">
                      <KanbanBoard />
                    </div>
                    <div className="h-48 border-t bg-muted/20 flex flex-col">
                      <div className="px-4 py-2 border-b">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Agent Activity
                        </span>
                      </div>
                      <AgentActivityFeed />
                    </div>
                  </>
                )}
              </ErrorBoundary>
            )}

            {sidebarView === 'prd' && (
              <div className="p-6 overflow-auto h-full">
                <h2 className="text-lg font-semibold mb-4">Product Requirements Document</h2>
                <div className="whitespace-pre-wrap font-mono text-sm bg-muted/30 rounded-lg p-4 border">
                  {prdMarkdown || 'No PRD available.'}
                </div>
              </div>
            )}

            {sidebarView === 'summary' && (
              <ErrorBoundary fallbackMessage="Failed to load summary.">
                <Summary projectId={activeProject.id} />
              </ErrorBoundary>
            )}

            {sidebarView === 'settings' && (
              <div className="p-6 space-y-4">
                <h2 className="text-lg font-semibold">Settings</h2>
                <button
                  onClick={onSwitchProject}
                  className="text-sm text-primary hover:underline"
                >
                  Switch Project
                </button>
              </div>
            )}
          </div>

          {selectedTaskId && <TaskDetail />}
        </div>
      </div>

      {reviewingTaskId && (() => {
        const reviewTask = tasks.find(t => t.id === reviewingTaskId)
        if (!reviewTask) return null
        return (
          <ReviewPanel
            task={reviewTask}
            onClose={() => setReviewingTaskId(null)}
          />
        )
      })()}
    </AppShell>
  )
}
