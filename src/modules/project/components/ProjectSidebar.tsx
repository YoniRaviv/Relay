import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { LayoutDashboard, FileText, BarChart3, Settings, Plus, Check, FolderOpen, ChevronDown, History } from 'lucide-react'
import { ThemeToggle } from '@/modules/settings'
import { useRelayStore } from '@/store/useRelayStore'
import { useIpcListener } from '@/shared/hooks/useIpcListener'

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
]

function extractTitle(description: string): string {
    const first = description.split('\n')[0].trim()
    if (first.length > 30) return first.slice(0, 30) + '...'
    return first || 'Untitled Feature'
}

function relativeTime(dateStr: string): string {
    const now = Date.now()
    const then = new Date(dateStr).getTime()
    const diff = now - then
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d ago`
    return `${Math.floor(days / 30)}mo ago`
}

interface GitLogEntry {
    hash: string
    message: string
    date: string
    author: string
}

export function ProjectSidebar({ projectName, activeView, onViewChange, onNewFeature, onSelectFeature, onSwitchProject }: ProjectSidebarProps) {
    const { features, activePrdId, activeProject } = useRelayStore()
    const [gitHistory, setGitHistory] = useState<GitLogEntry[]>([])
    const [historyOpen, setHistoryOpen] = useState(false)

    const refreshCommits = useCallback(() => {
        if (!activeProject) return
        window.relayAPI.gitLog(activeProject.id)
            .then((logs) => setGitHistory((logs as GitLogEntry[]).slice(0, 15)))
            .catch(() => setGitHistory([]))
    }, [activeProject])

    useEffect(() => {
        refreshCommits()
    }, [refreshCommits])

    useIpcListener('loop:tasksUpdated', refreshCommits, [refreshCommits])

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
                                <button
                                    key={f.id}
                                    onClick={() => onSelectFeature?.(f.id)}
                                    className={`w-full text-left px-2 py-1.5 rounded-md text-[13px] flex items-center gap-2 transition-colors ${
                                        isActive
                                            ? 'bg-secondary text-secondary-foreground'
                                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                    }`}
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

            {/* ── Git History (below nav, collapsible) ── */}
            {gitHistory.length > 0 && (
                <div className="mt-4">
                    <button
                        type="button"
                        onClick={() => setHistoryOpen(!historyOpen)}
                        className="flex items-center gap-2 px-1 group w-full"
                    >
                        <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform duration-150 ${historyOpen ? '' : '-rotate-90'}`} />
                        <History className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">
                            Commits
                        </span>
                        <span className="ml-auto text-[10px] text-muted-foreground/50 tabular-nums">
                            {gitHistory.length}
                        </span>
                    </button>
                    {historyOpen && (
                        <div className="mt-2 max-h-[220px] overflow-auto">
                            {/* Timeline line */}
                            <div className="relative pl-5">
                                <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border/60" />
                                {gitHistory.map((entry, i) => (
                                    <div key={entry.hash} className="relative flex items-start gap-2.5 pb-3 last:pb-0 group">
                                        {/* Timeline dot */}
                                        <div className={`absolute left-[-13px] top-[5px] w-[7px] h-[7px] rounded-full border-2 border-[var(--color-sidebar)] ${
                                            i === 0 ? 'bg-primary' : 'bg-muted-foreground/30'
                                        }`} />
                                        {/* Content */}
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0">
                                                    {entry.hash.slice(0, 7)}
                                                </span>
                                                <span className="text-[11px] text-muted-foreground/50 shrink-0">
                                                    {relativeTime(entry.date)}
                                                </span>
                                            </div>
                                            <p className="text-[12px] text-foreground/80 truncate leading-snug mt-0.5 group-hover:text-foreground transition-colors">
                                                {entry.message.split('\n')[0]}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

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
