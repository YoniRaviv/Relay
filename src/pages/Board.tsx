import { useEffect, useState } from 'react'
import { AppShell } from '@/components/AppShell'
import { ProjectSidebar, type SidebarView } from '@/components/ProjectSidebar'
import { KanbanBoard } from '@/components/KanbanBoard'
import { TaskDetail } from '@/components/TaskDetail'
import { useRelayStore } from '@/store/useRelayStore'

interface BoardProps {
  onSwitchProject: () => void
}

export function Board({ onSwitchProject }: BoardProps) {
  const { activeProject, setTasks, selectedTaskId, prdMarkdown } = useRelayStore()
  const [sidebarView, setSidebarView] = useState<SidebarView>('board')

  useEffect(() => {
    if (activeProject) {
      window.relayAPI.listTasks(activeProject.id).then(setTasks)
    }
  }, [activeProject, setTasks])

  if (!activeProject) return null

  const handleViewChange = (view: SidebarView) => {
    setSidebarView(view)
  }

  return (
    <AppShell
      sidebar={
        <ProjectSidebar
          projectName={activeProject.name}
          activeView={sidebarView}
          onViewChange={handleViewChange}
        />
      }
    >
      <div className="flex h-full">
        <div className="flex-1 overflow-hidden">
          {sidebarView === 'board' && <KanbanBoard />}

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
    </AppShell>
  )
}
