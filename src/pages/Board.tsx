import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AppShell } from '@/shared/components/AppShell'
import { ProjectSidebar, type SidebarView } from '@/modules/project'
import { KanbanBoard, TaskDetail, ArchiveView } from '@/modules/board'
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
    const activeProject = useRelayStore((s) => s.activeProject)
    const tasks = useRelayStore((s) => s.tasks)
    const setTasks = useRelayStore((s) => s.setTasks)
    const selectedTaskId = useRelayStore((s) => s.selectedTaskId)
    const prdMarkdown = useRelayStore((s) => s.prdMarkdown)
    const activePrdId = useRelayStore((s) => s.activePrdId)
    const features = useRelayStore((s) => s.features)
    const setFeatures = useRelayStore((s) => s.setFeatures)
    const setLoopState = useRelayStore((s) => s.setLoopState)
    const setCurrentTaskId = useRelayStore((s) => s.setCurrentTaskId)
    const addActivity = useRelayStore((s) => s.addActivity)
    const updateTask = useRelayStore((s) => s.updateTask)
    const setBuildStartTime = useRelayStore((s) => s.setBuildStartTime)
    const reviewingTaskId = useRelayStore((s) => s.reviewingTaskId)
    const setReviewingTaskId = useRelayStore((s) => s.setReviewingTaskId)
    const projectContext = useRelayStore((s) => s.projectContext)
    const scanningProject = useRelayStore((s) => s.scanningProject)
    const setArchivedFeatures = useRelayStore((s) => s.setArchivedFeatures)

    const activeFeature = features.find(f => f.id === activePrdId)
    const activeFeatureTitle = activeFeature
        ? (activeFeature.description.split('\n')[0].trim() || 'Untitled Feature')
        : null
    const [sidebarView, setSidebarView] = useState<SidebarView>('board')
    const [loading, setLoading] = useState(true)
    const [showPrDialog, setShowPrDialog] = useState(false)

    const refreshArchivedCount = useCallback(() => {
        if (activeProject) {
            window.relayAPI.listArchivedFeatures(activeProject.id)
                .then(setArchivedFeatures)
                .catch(() => {})
        }
    }, [activeProject, setArchivedFeatures])

    useEffect(() => {
        if (activeProject) {
            setLoading(true)
            window.relayAPI.listTasks(activeProject.id, activePrdId ?? undefined)
                .then(setTasks)
                .catch(() => toast.error('Failed to load tasks'))
                .finally(() => setLoading(false))

            // Fetch archived features count for sidebar badge
            refreshArchivedCount()

            // Ensure .gitignore has .relay/ entry for existing projects
            window.relayAPI.gitEnsureGitignore(activeProject.id).catch(() => {})
        }
    }, [activeProject, activePrdId, setTasks, refreshArchivedCount])

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
            const doneCount = filtered.filter(t => t.status === 'done').length
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
        if (view === 'board' || view === 'prd' || view === 'summary' || view === 'archive') {
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
                    onDeleteFeature={async (prdId) => {
                        // Stop loop if it's running for this feature
                        const { loopState: ls, activePrdId: currentPrd } = useRelayStore.getState()
                        if (currentPrd === prdId && (ls === 'running' || ls === 'paused')) {
                            await window.relayAPI.stopLoop()
                        }
                        await window.relayAPI.deletePrd(prdId)
                        // Refresh features and switch to another if available
                        const freshFeatures = await window.relayAPI.listPrds(activeProject.id)
                        setFeatures(freshFeatures)
                        if (prdId === useRelayStore.getState().activePrdId) {
                            if (freshFeatures.length > 0) {
                                onSelectFeature(freshFeatures[0].id)
                            } else {
                                setTasks([])
                                useRelayStore.getState().setPrd(null)
                                useRelayStore.getState().setPrdMarkdown('')
                                useRelayStore.getState().setActivePrdId(null)
                            }
                        }
                        toast.success('Feature deleted')
                    }}
                    onArchiveFeature={async (prdId) => {
                        await window.relayAPI.archiveFeature(prdId)
                        const freshFeatures = await window.relayAPI.listPrds(activeProject.id)
                        setFeatures(freshFeatures)
                        refreshArchivedCount()
                        // If we just archived the active feature, switch to the next one
                        if (prdId === useRelayStore.getState().activePrdId) {
                            if (freshFeatures.length > 0) {
                                onSelectFeature(freshFeatures[0].id)
                            } else {
                                setTasks([])
                                useRelayStore.getState().setPrd(null)
                                useRelayStore.getState().setPrdMarkdown('')
                                useRelayStore.getState().setActivePrdId(null)
                            }
                        }
                        toast.success('Feature archived')
                    }}
                    onSwitchProject={onSwitchProject}
                />
            }
        >
            <div className="flex flex-col h-full">
                {/* Header with loop controls */}
                {sidebarView === 'board' && (
                    <div className="flex items-center justify-between gap-3 px-6 py-2.5 border-b border-border/30">
                        <div className="flex flex-col gap-2 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                                {activeFeatureTitle ? (
                                    <>
                                        <h2 className="text-sm font-semibold truncate max-w-[400px]">{activeFeatureTitle}</h2>
                                        {activeFeature && (
                                            <span className="text-[10px] font-medium text-muted-foreground shrink-0">
                                                {activeFeature.doneCount}/{activeFeature.taskCount} tasks
                                            </span>
                                        )}
                                    </>
                                ) : (
                                    <h2 className="text-sm font-semibold">Kanban Board</h2>
                                )}
                            </div>
                            <BranchIndicator />
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <ModelPicker />
                            <LoopControls onArchiveFeature={activePrdId ? async () => {
                                await window.relayAPI.archiveFeature(activePrdId)
                                const freshFeatures = await window.relayAPI.listPrds(activeProject.id)
                                setFeatures(freshFeatures)
                                refreshArchivedCount()
                                if (freshFeatures.length > 0) {
                                    onSelectFeature(freshFeatures[0].id)
                                } else {
                                    setTasks([])
                                    useRelayStore.getState().setPrd(null)
                                    useRelayStore.getState().setPrdMarkdown('')
                                    useRelayStore.getState().setActivePrdId(null)
                                }
                                toast.success('Feature archived')
                            } : undefined} />
                        </div>
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
                                        <div className="h-56 bg-[var(--color-sidebar)] flex flex-col border-t border-border">
                                            <div className="px-4 py-2 flex items-center gap-3 border-b border-border/40">
                                                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
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
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-lg font-semibold">Product Requirements Document</h2>
                                    {prdMarkdown && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="gap-1.5 text-xs"
                                            onClick={() => {
                                                useRelayStore.getState().setWizardStep(1)
                                                onNewFeature()
                                            }}
                                        >
                                            Edit & Re-decompose
                                        </Button>
                                    )}
                                </div>
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

                        {sidebarView === 'archive' && (
                            <ArchiveView onUnarchive={async (prdId) => {
                                await window.relayAPI.unarchiveFeature(prdId)
                                const freshFeatures = await window.relayAPI.listPrds(activeProject.id)
                                setFeatures(freshFeatures)
                                refreshArchivedCount()
                                toast.success('Feature restored')
                            }} />
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
