import { Button } from '@/components/ui/button'
import { LayoutDashboard, FileText, BarChart3, Settings, Plus, Check, FolderOpen } from 'lucide-react'
import { ThemeToggle } from '@/modules/settings'
import { useRelayStore } from '@/store/useRelayStore'

export type SidebarView = 'board' | 'prd' | 'summary' | 'settings'

interface ProjectSidebarProps {
    projectName: string
    activeView: SidebarView
    onViewChange: (view: SidebarView) => void
    onNewFeature?: () => void
    onSelectFeature?: (prdId: string) => void
    onSwitchProject?: () => void
}

const navItems: { id: SidebarView; label: string; icon: React.ReactNode }[] = [
    { id: 'board', label: 'Board', icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: 'prd', label: 'PRD', icon: <FileText className="h-4 w-4" /> },
    { id: 'summary', label: 'Summary', icon: <BarChart3 className="h-4 w-4" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
]

function extractTitle(description: string): string {
    const first = description.split('\n')[0].trim()
    if (first.length > 30) return first.slice(0, 30) + '...'
    return first || 'Untitled Feature'
}

export function ProjectSidebar({ projectName, activeView, onViewChange, onNewFeature, onSelectFeature, onSwitchProject }: ProjectSidebarProps) {
    const { features, activePrdId } = useRelayStore()

    return (
        <div className="flex flex-col h-full p-4">
            <div className="mb-6">
                <h1 className="text-lg font-bold tracking-tight">Relay</h1>
                <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-xs text-muted-foreground truncate">{projectName}</p>
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

            {onNewFeature && (
                <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start gap-2 mb-4"
                    onClick={onNewFeature}
                >
                    <Plus className="h-4 w-4" />
                    New Feature
                </Button>
            )}

            {features.length > 0 && (
                <div className="mb-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                        Features
                    </p>
                    <div className="space-y-0.5 max-h-[200px] overflow-auto">
                        {features.map((f) => {
                            const isActive = f.id === activePrdId
                            const isComplete = f.taskCount > 0 && f.doneCount === f.taskCount
                            return (
                                <button
                                    key={f.id}
                                    onClick={() => onSelectFeature?.(f.id)}
                                    className={`w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors ${
                                        isActive
                                            ? 'bg-secondary text-secondary-foreground'
                                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                    }`}
                                >
                                    {isComplete ? (
                                        <Check className="h-3 w-3 text-green-500 shrink-0" />
                                    ) : (
                                        <span className="shrink-0 text-center text-[10px] leading-3 text-muted-foreground">
                                            {f.doneCount}/{f.taskCount} 
                                        </span>
                                    )}
                                    <span className="truncate">{extractTitle(f.description)}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            <nav className="space-y-1">
                {navItems.map((item) => (
                    <Button
                        key={item.id}
                        variant={activeView === item.id ? 'secondary' : 'ghost'}
                        className="w-full justify-start gap-2"
                        size="sm"
                        onClick={() => onViewChange(item.id)}
                    >
                        {item.icon}
                        {item.label}
                    </Button>
                ))}
            </nav>

            <div className="mt-auto pt-4 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Theme</span>
                <ThemeToggle />
            </div>
        </div>
    )
}
