import { Button } from '@/components/ui/button'
import { LayoutDashboard, FileText, BarChart3, Settings, Plus, Check, FolderOpen, Trash2, Archive, Search } from 'lucide-react'
import { ThemeToggle } from '@/modules/settings'
import { useRelayStore } from '@/store/useRelayStore'
import { extractTitle } from '@/shared/formatters'
import { GitHistoryPanel } from './GitHistoryPanel'

export type SidebarView = 'board' | 'prd' | 'summary' | 'settings' | 'archive' | 'review'

interface ProjectSidebarProps {
    projectName: string
    activeView: SidebarView
    onViewChange: (view: SidebarView) => void
    onNewFeature?: () => void
    onSelectFeature?: (prdId: string) => void
    onDeleteFeature?: (prdId: string) => void
    onArchiveFeature?: (prdId: string) => void
    onSwitchProject?: () => void
}

const navItems: { id: SidebarView; label: string; icon: React.ReactNode }[] = [
    { id: 'board', label: 'Board', icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: 'prd', label: 'Feature Spec', icon: <FileText className="h-4 w-4" /> },
    { id: 'summary', label: 'Summary', icon: <BarChart3 className="h-4 w-4" /> },
]

export function ProjectSidebar({ projectName, activeView, onViewChange, onNewFeature, onSelectFeature, onDeleteFeature, onArchiveFeature, onSwitchProject }: ProjectSidebarProps) {
    const { features, activePrdId, archivedFeatures, loopState } = useRelayStore()

    const handleSelectFeature = (prdId: string) => {
        if (prdId === activePrdId) return
        if (loopState === 'running' || loopState === 'paused') {
            if (!window.confirm('The build loop is active on the current feature. Switch anyway? The loop will be stopped.')) {
                return
            }
            window.relayAPI.stopLoop()
        }
        onSelectFeature?.(prdId)
    }

    return (
        <div className="flex flex-col h-full p-4">
            {/* ── Header ── */}
            <div className="mb-5">
                <h1 className="text-[19px] font-bold tracking-tight leading-tight">Relay Studio</h1>
                <div className="flex items-center gap-1.5 mt-1">
                    <p className="text-[13px] text-muted-foreground truncate">{projectName}</p>
                    {onSwitchProject && (
                        <button
                            onClick={onSwitchProject}
                            title="Switch project"
                            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <FolderOpen className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* ── New Feature ── */}
            {onNewFeature && (
                <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start gap-2 mb-4 text-[13px]"
                    onClick={onNewFeature}
                >
                    <Plus className="h-4 w-4" />
                    New Feature
                </Button>
            )}

            {/* ── Features List ── */}
            {features.length > 0 && (
                <div className="mb-2">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">
                        Features
                    </p>
                    {/* Project-level progress */}
                    {(() => {
                        const totalTasks = features.reduce((s, f) => s + f.taskCount, 0)
                        const doneTasks = features.reduce((s, f) => s + f.doneCount, 0)
                        const completedFeatures = features.filter(f => f.taskCount > 0 && f.doneCount === f.taskCount).length
                        return (
                            <div className="px-2 py-2 rounded-md bg-muted/30 mb-2">
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                    <span>{completedFeatures}/{features.length} features</span>
                                    <span>{doneTasks}/{totalTasks} tasks</span>
                                </div>
                                {totalTasks > 0 && (
                                    <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary rounded-full transition-all duration-500"
                                            style={{ width: `${Math.round((doneTasks / totalTasks) * 100)}%` }}
                                        />
                                    </div>
                                )}
                            </div>
                        )
                    })()}
                    <div className="space-y-0.5 max-h-[200px] overflow-auto">
                        {features.map((f) => {
                            const isActive = f.id === activePrdId
                            const isComplete = f.taskCount > 0 && f.doneCount === f.taskCount
                            return (
                                <div
                                    key={f.id}
                                    className={`group flex items-center rounded-md transition-colors ${
                                        isActive
                                            ? 'bg-primary/10 text-foreground border-l-2 border-primary'
                                            : 'text-muted-foreground hover:bg-muted hover:text-foreground border-l-2 border-transparent'
                                    }`}
                                >
                                    <button
                                        onClick={() => handleSelectFeature(f.id)}
                                        className="flex-1 text-left px-2 py-1.5 text-[13px] flex items-center gap-2 min-w-0"
                                    >
                                        {isComplete ? (
                                            <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                        ) : (
                                            <span className="shrink-0 text-center text-[10px] leading-3 text-muted-foreground">
                                                {f.doneCount}/{f.taskCount}
                                            </span>
                                        )}
                                        <span className="truncate">{extractTitle(f.description, f.title)}</span>
                                    </button>
                                    {onArchiveFeature && isComplete && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                onArchiveFeature(f.id)
                                            }}
                                            className="shrink-0 p-1.5 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all"
                                            title="Archive feature"
                                        >
                                            <Archive className="h-3 w-3" />
                                        </button>
                                    )}
                                    {onDeleteFeature && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                if (window.confirm(`Delete "${extractTitle(f.description, f.title)}" and all its tasks? This cannot be undone.`)) {
                                                    onDeleteFeature(f.id)
                                                }
                                            }}
                                            className={`shrink-0 p-1.5 mr-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all ${
                                                isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-100'
                                            }`}
                                            title="Delete feature"
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </button>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* ── Separator ── */}
            <div className="border-t border-border/50 my-3" />

            {/* ── Navigation ── */}
            <nav className="space-y-0.5">
                {navItems.map((item) => (
                    <Button
                        key={item.id}
                        variant={activeView === item.id ? 'secondary' : 'ghost'}
                        className="w-full justify-start gap-2 text-[13px]"
                        size="sm"
                        onClick={() => onViewChange(item.id)}
                    >
                        {item.icon}
                        {item.label}
                    </Button>
                ))}
                {(() => {
                    const allDone = features.some(f => f.id === activePrdId && f.taskCount > 0 && f.doneCount === f.taskCount)
                    return (
                        <Button
                            variant={activeView === 'review' ? 'secondary' : 'ghost'}
                            className={`w-full justify-start gap-2 text-[13px] ${
                                allDone
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-muted-foreground opacity-50'
                            }`}
                            size="sm"
                            onClick={() => onViewChange('review')}
                            disabled={!allDone}
                            title={allDone ? 'Run code review' : 'Available after all tasks are done'}
                        >
                            <Search className="h-4 w-4" />
                            Code Review
                            {allDone && activeView !== 'review' && (
                                <span className="ml-auto text-[9px] font-semibold bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded">
                                    Ready
                                </span>
                            )}
                        </Button>
                    )
                })()}
                {archivedFeatures.length > 0 && (
                    <Button
                        variant={activeView === 'archive' ? 'secondary' : 'ghost'}
                        className="w-full justify-start gap-2 text-[13px]"
                        size="sm"
                        onClick={() => onViewChange('archive')}
                    >
                        <Archive className="h-4 w-4" />
                        Archived Features
                        <span className="ml-auto text-[10px] text-muted-foreground">{archivedFeatures.length}</span>
                    </Button>
                )}
            </nav>

            {/* ── Git History ── */}
            <GitHistoryPanel />

            {/* ── Footer ── */}
            <div className="mt-auto pt-4 border-t border-border/50 flex items-center gap-2">
                <Button
                    variant={activeView === 'settings' ? 'secondary' : 'ghost'}
                    className="flex-1 justify-start gap-2 text-[13px]"
                    size="sm"
                    onClick={() => onViewChange('settings')}
                >
                    <Settings className="h-4 w-4" />
                    Settings
                </Button>
                <ThemeToggle />
            </div>
        </div>
    )
}
