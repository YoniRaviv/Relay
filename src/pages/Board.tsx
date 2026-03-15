import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AppShell } from '@/shared/components/AppShell'
import { ProjectSidebar, type SidebarView } from '@/modules/project'
import { KanbanBoard, TaskDetail } from '@/modules/board'
import { LoopControls, AgentActivityFeed } from '@/modules/agent'
import { ReviewPanel, PrCreationDialog } from '@/modules/review'
import { BranchIndicator } from '@/shared/components/BranchIndicator'
import { ProjectContextBadge } from '@/shared/components/ProjectContextBadge'
import { ModelPicker, SettingsView } from '@/modules/settings'
import { Summary } from '@/pages/Summary'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import { BoardSkeleton } from '@/shared/components/LoadingSkeleton'
import { useKeyboardShortcuts } from '@/lib/shortcuts'
import { useRelayStore } from '@/store/useRelayStore'
import { useIpcListener } from '@/shared/hooks/useIpcListener'
import { Button } from '@/components/ui/button'
import { BuildTimer } from '@/modules/agent/components/BuildTimer'
import type { Task, TaskLog, LoopState } from '@shared/types'

interface BoardProps {
    onSwitchProject: () => void
    onNewFeature: () => void
    onSelectFeature: (prdId: string) => void
}

export function Board({ onSwitchProject, onNewFeature, onSelectFeature }: BoardProps) {
    const {
        activeProject, tasks, setTasks, selectedTaskId, prdMarkdown, activePrdId, features, setFeatures,
        setLoopState, setCurrentTaskId, addActivity, updateTask, setBuildStartTime,
        reviewingTaskId, setReviewingTaskId,
        projectContext, scanningProject,
    } = useRelayStore()

    const activeFeature = features.find(f => f.id === activePrdId)
    const activeFeatureTitle = activeFeature
        ? (activeFeature.description.split('\n')[0].trim().slice(0, 40) || 'Untitled Feature')
        : null
    const [sidebarView, setSidebarView] = useState<SidebarView>('board')
    const [loading, setLoading] = useState(true)
    const [showPrDialog, setShowPrDialog] = useState(false)

    useEffect(() => {
        if (activeProject) {
            setLoading(true)
            window.relayAPI.listTasks(activeProject.id, activePrdId ?? undefined)
                .then(setTasks)
                .catch(() => toast.error('Failed to load tasks'))
                .finally(() => setLoading(false))

            // Ensure .gitignore has .relay/ entry for existing projects
            window.relayAPI.gitEnsureGitignore(activeProject.id).catch(() => {})
        }
    }, [activeProject, activePrdId, setTasks])

    // Keyboard shortcuts — Space toggles pause/resume only (Start requires the branch setup dialog via LoopControls)
    const toggleLoop = () => {
        const { loopState } = useRelayStore.getState()
        if (!activeProject) return
        if (loopState === 'running') {
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
    useIpcListener('agent:activity', (data: unknown) => {
        addActivity(data as TaskLog)
    }, [addActivity])

    useIpcListener('loop:stateChange', (data: unknown) => {
        const { state } = data as { state: LoopState }
        setLoopState(state)
    }, [setLoopState])

    useIpcListener('loop:taskChange', (data: unknown) => {
        const { taskId } = data as { taskId: string | null }
        setCurrentTaskId(taskId)
        // Fix 2: Optimistically move task to in_progress when build starts
        if (taskId) {
            updateTask(taskId, { status: 'in_progress' })
            setBuildStartTime(new Date().toISOString())
        } else {
            setBuildStartTime(null)
        }
    }, [setCurrentTaskId, updateTask, setBuildStartTime])

    useIpcListener('loop:tasksUpdated', (data: unknown) => {
        const incoming = data as Task[]
        // Fix 1 safety net: filter by activePrdId to prevent cross-feature leakage
        const { activePrdId: currentPrdId, features: currentFeatures } = useRelayStore.getState()
        const filtered = currentPrdId
            ? incoming.filter(t => t.prdId === currentPrdId)
            : incoming
        setTasks(filtered)

        // Fix 3: Update feature counter after task status changes
        if (currentPrdId && currentFeatures.length > 0) {
            const doneCount = filtered.filter(t => t.status === 'done' || t.status === 'approved').length
            const updated = currentFeatures.map(f =>
                f.id === currentPrdId ? { ...f, doneCount, taskCount: filtered.length } : f
            )
            setFeatures(updated)
        }
    }, [setTasks, setFeatures])

    useIpcListener('agent:error', (data: unknown) => {
        const { message } = data as { message: string }
        toast.error('Agent error', { description: message })
    })

    useIpcListener('loop:taskDone', (data: unknown) => {
        const { storyId } = data as { storyId: string }
        toast.success(`${storyId} ready for review`)
    })

    useIpcListener('loop:allTasksComplete', () => {
        const { featureBranch } = useRelayStore.getState()
        if (featureBranch) {
            setShowPrDialog(true)
        }
    })

    // Menu bar events
    useIpcListener('menu:openSettings', () => setSidebarView('settings'), [])
    useIpcListener('menu:navigate', (view: unknown) => {
        if (view === 'board' || view === 'prd' || view === 'summary') {
            setSidebarView(view as SidebarView)
        }
    }, [])
    useIpcListener('menu:loopToggle', toggleLoop, [])
    useIpcListener('menu:loopPause', () => {
        const { loopState: ls } = useRelayStore.getState()
        if (ls === 'running') {
            useRelayStore.getState().setLoopState('paused')
            window.relayAPI.pauseLoop()
        }
    }, [])
    useIpcListener('menu:loopStop', () => {
        const { loopState: ls } = useRelayStore.getState()
        if (ls === 'running' || ls === 'paused') {
            useRelayStore.getState().setLoopState('stopped')
            window.relayAPI.stopLoop()
        }
    }, [])

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
                    onNewFeature={onNewFeature}
                    onSelectFeature={onSelectFeature}
                    onSwitchProject={onSwitchProject}
                />
            }
        >
            <div className="flex flex-col h-full">
                {/* Header with loop controls */}
                {sidebarView === 'board' && (
                    <div className="flex items-center justify-between px-6 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                            {activeFeatureTitle ? (
                                <div className="flex items-center gap-2 min-w-0">
                                    <h2 className="text-sm font-semibold truncate max-w-[260px]">{activeFeatureTitle}</h2>
                                    {activeFeature && (
                                        <span className="text-[10px] font-medium text-muted-foreground shrink-0">
                                            {activeFeature.doneCount}/{activeFeature.taskCount} tasks
                                        </span>
                                    )}
                                </div>
                            ) : (
                                <h2 className="text-sm font-semibold">Kanban Board</h2>
                            )}
                            <BranchIndicator />
                            <ModelPicker />
                        </div>
                        <LoopControls />
                    </div>
                )}

                <div className="flex flex-1 overflow-hidden">
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {sidebarView === 'board' && (
                            <ErrorBoundary fallbackMessage="The board encountered an error.">
                                {loading ? (
                                    <BoardSkeleton />
                                ) : !activePrdId ? (
                                    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
                                        <div className="rounded-full bg-muted p-4">
                                            <Plus className="h-8 w-8 text-muted-foreground" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-semibold mb-1">No features yet</h3>
                                            <p className="text-sm text-muted-foreground max-w-sm">
                                                Create your first feature to generate a PRD and start building with the AI agent loop.
                                            </p>
                                        </div>
                                        <Button onClick={onNewFeature} className="gap-2">
                                            <Plus className="h-4 w-4" />
                                            Create Feature
                                        </Button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex-1 overflow-hidden">
                                            <KanbanBoard />
                                        </div>
                                        <div className="h-56 bg-[var(--color-sidebar)] flex flex-col border-t border-border/50">
                                            <div className="px-4 py-2 flex items-center gap-3 border-b border-border/30">
                                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                                    Agent Activity
                                                </span>
                                                <BuildTimer />
                                                <div className="ml-auto">
                                                    <ProjectContextBadge projectContext={projectContext} scanning={scanningProject} />
                                                </div>
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
                                {prdMarkdown ? (
                                    <div className="prose prose-sm dark:prose-invert max-w-none bg-muted/30 rounded-lg p-4">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                            {prdMarkdown}
                                        </ReactMarkdown>
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">No PRD available.</p>
                                )}
                            </div>
                        )}

                        {sidebarView === 'summary' && (
                            <ErrorBoundary fallbackMessage="Failed to load summary.">
                                <Summary projectId={activeProject.id} />
                            </ErrorBoundary>
                        )}

                        {sidebarView === 'settings' && (
                            <SettingsView onSwitchProject={onSwitchProject} />
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

            {showPrDialog && (
                <PrCreationDialog onClose={(createdUrl?: string) => {
                    setShowPrDialog(false)
                    if (createdUrl) useRelayStore.getState().setPrUrl(createdUrl)
                }} />
            )}
        </AppShell>
    )
}
