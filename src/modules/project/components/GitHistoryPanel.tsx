import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, History } from 'lucide-react'
import { useRelayStore } from '@/store/useRelayStore'
import { useIpcListener } from '@/shared/hooks/useIpcListener'

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

export function GitHistoryPanel() {
    const { activeProject, currentBranch } = useRelayStore()
    const [gitHistory, setGitHistory] = useState<GitLogEntry[]>([])
    const [historyOpen, setHistoryOpen] = useState(false)

    const refreshCommits = useCallback(() => {
        if (!activeProject) return
        window.relayAPI.gitLog(activeProject.id)
            .then((logs) => setGitHistory((logs as GitLogEntry[]).slice(0, 15)))
            .catch(() => setGitHistory([]))
    }, [activeProject, currentBranch]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        refreshCommits()
    }, [refreshCommits])

    useIpcListener('loop:tasksUpdated', refreshCommits, [refreshCommits])

    if (gitHistory.length === 0) return null

    return (
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
                <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
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
                                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                                            {entry.hash.slice(0, 7)}
                                        </span>
                                        <span className="text-[11px] text-muted-foreground shrink-0">
                                            {relativeTime(entry.date)}
                                        </span>
                                    </div>
                                    <p className="text-[12px] text-foreground/90 truncate leading-snug mt-0.5 group-hover:text-foreground transition-colors">
                                        {entry.message.split('\n')[0]}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
