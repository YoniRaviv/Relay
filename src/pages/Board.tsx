import { useEffect, useState } from 'react'
import { AppShell } from '@/components/AppShell'
import { ProjectSidebar, type SidebarView } from '@/components/ProjectSidebar'
import { KanbanBoard } from '@/components/KanbanBoard'
import { TaskDetail } from '@/components/TaskDetail'
import { LoopControls } from '@/components/LoopControls'
import { AgentActivityFeed } from '@/components/AgentActivityFeed'
import { useRelayStore } from '@/store/useRelayStore'
import type { Task, TaskLog, LoopState } from '@shared/types'

interface BoardProps {
  onSwitchProject: () => void
}

export function Board({ onSwitchProject }: BoardProps) {
  const {
    activeProject, setTasks, selectedTaskId, prdMarkdown,
    setLoopState, setCurrentTaskId, addActivity,
  } = useRelayStore()
  const [sidebarView, setSidebarView] = useState<SidebarView>('board')

  useEffect(() => {
    if (activeProject) {
      window.relayAPI.listTasks(activeProject.id).then(setTasks)
    }
  }, [activeProject, setTasks])

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

    return () => {
      removeActivity()
      removeStateChange()
      removeTaskChange()
      removeTasksUpdated()
    }
  }, [addActivity, setLoopState, setCurrentTaskId, setTasks])

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
              <>
                <div className="flex-1 overflow-hidden">
                  <KanbanBoard />
                </div>
                {/* Activity feed at bottom */}
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

            {sidebarView === 'prd' && (
              <div className="p-6 overflow-auto h-full">
                <h2 className="text-lg font-semibold mb-4">Product Requirements Document</h2>
                <div className="whitespace-pre-wrap font-mono text-sm bg-muted/30 rounded-lg p-4 border">
                  {prdMarkdown || 'No PRD available.'}
                </div>
              </div>
            )}

            {sidebarView === 'summary' && (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Summary dashboard will be available in Phase 7.
              </div>
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
    </AppShell>
  )
}
