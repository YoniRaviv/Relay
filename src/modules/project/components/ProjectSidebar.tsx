import { Button } from '@/components/ui/button'
import { LayoutDashboard, FileText, BarChart3, Settings, Plus, Check, FolderOpen, Trash2 } from 'lucide-react'
import { ThemeToggle } from '@/modules/settings'
import { useRelayStore } from '@/store/useRelayStore'
import { GitHistoryPanel } from './GitHistoryPanel'

export type SidebarView = 'board' | 'prd' | 'summary' | 'settings'

interface ProjectSidebarProps {
    projectName: string
    activeView: SidebarView
    onViewChange: (view: SidebarView) => void
    onNewFeature?: () => void
    onSelectFeature?: (prdId: string) => void
    onDeleteFeature?: (prdId: string) => void
    onSwitchProject?: () => void
}

const navItems: { id: SidebarView; label: string; icon: React.ReactNode }[] = [
    { id: 'board', label: 'Board', icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: 'prd', label: 'PRD', icon: <FileText className="h-4 w-4" /> },
    { id: 'summary', label: 'Summary', icon: <BarChart3 className="h-4 w-4" /> },
]

function extractTitle(description: string): string {
    const first = description.split('\n')[0].trim()
    if (first.length > 30) return first.slice(0, 30) + '...'
    return first || 'Untitled Feature'
}

export function ProjectSidebar({ projectName, activeView, onViewChange, onNewFeature, onSelectFeature, onDeleteFeature, onSwitchProject }: ProjectSidebarProps) {
    const { features, activePrdId } = useRelayStore()

    return (
        <div className="flex flex-col h-full p-4">
            {/* ── Header ── */}
            <div className="mb-5">
                <h1 className="text-[19px] font-bold tracking-tight leading-tight">Relay</h1>
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
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                        Features
                    </p>
                    <div className="space-y-0.5 max-h-[200px] overflow-auto">
                        {features.map((f) => {
                            const isActive = f.id === activePrdId
                            const isComplete = f.taskCount > 0 && f.doneCount === f.taskCount
                            return (
                                <div
                                    key={f.id}
                                    className={`group flex items-center rounded-md transition-colors ${
                                        isActive
                                            ? 'bg-secondary text-secondary-foreground'
                                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                    }`}
                                >
                                    <button
                                        onClick={() => onSelectFeature?.(f.id)}
                                        className="flex-1 text-left px-2 py-1.5 text-[13px] flex items-center gap-2 min-w-0"
                                    >
                                        {isComplete ? (
                                            <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                        ) : (
                                            <span className="shrink-0 text-center text-[10px] leading-3 text-muted-foreground">
                                                {f.doneCount}/{f.taskCount}
                                            </span>
                                        )}
                                        <span className="truncate">{extractTitle(f.description)}</span>
                                    </button>
                                    {onDeleteFeature && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                if (window.confirm(`Delete "${extractTitle(f.description)}" and all its tasks? This cannot be undone.`)) {
                                                    onDeleteFeature(f.id)
                                                }
                                            }}
                                            className="shrink-0 p-1.5 mr-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
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
