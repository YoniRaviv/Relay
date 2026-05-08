import { useMemo, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { X, Eye, GitCommit, Pause, CheckCircle2, AlertTriangle, Circle, SquareCheck, RotateCcw } from 'lucide-react'
import { ActionBlock } from '@/modules/agent/components/ActionBlock'
import { TextBlock } from '@/modules/agent/components/TextBlock'
import { groupActions } from '@/modules/agent/utils/parseActivity'
import { isActionGroup } from '@/shared/types/activity'
import { FormattedDescription } from './FormattedDescription'
import { CompletedTaskSummary } from './CompletedTaskSummary'
import { CollapsibleSection } from '@/shared/components/CollapsibleSection'
import { useRelayStore } from '@/store/useRelayStore'
import { statusLabels, priorityBadgeColors } from '@/shared/constants/statusMaps'

const statusIcons: Record<string, React.ReactNode> = {
    pending: <Circle className="h-3 w-3" />,
    in_progress: <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />,
    review: <Eye className="h-3 w-3" />,
    failed: <AlertTriangle className="h-3 w-3" />,
    done: <CheckCircle2 className="h-3 w-3" />,
}

/** Parse acceptance criteria text into individual items */
function parseCriteria(text: string): string[] {
    return text
        .split('\n')
        .map((line) => line.replace(/^[\s]*[-–•*]\s*/, '').trim())
        .filter(Boolean)
}

export function TaskDetail() {
    const tasks = useRelayStore((s) => s.tasks)
    const selectedTaskId = useRelayStore((s) => s.selectedTaskId)
    const setSelectedTaskId = useRelayStore((s) => s.setSelectedTaskId)
    const activityFeed = useRelayStore((s) => s.activityFeed)
    const currentTaskId = useRelayStore((s) => s.currentTaskId)
    const setReviewingTaskId = useRelayStore((s) => s.setReviewingTaskId)
    const setViewingStory = useRelayStore((s) => s.setViewingStory)
    const loopState = useRelayStore((s) => s.loopState)
    const task = tasks.find((t) => t.id === selectedTaskId)
    const activeProject = useRelayStore((s) => s.activeProject)
    const [persistedLogs, setPersistedLogs] = useState<typeof activityFeed>([])
    const [dbMetrics, setDbMetrics] = useState<{ durationMs: number; toolCalls: number; tokensIn: number; tokensOut: number; filesChanged?: string[] } | null>(null)

    // Load persisted logs + metrics from DB when in-memory activity is empty
    useEffect(() => {
        if (!task) return
        const inMemory = activityFeed.filter((a) => a.taskId === task.id)
        if (inMemory.length > 0) {
            setPersistedLogs([])
            setDbMetrics(null)
            return
        }
        window.relayAPI.getTaskLogs(task.id).then(setPersistedLogs).catch(() => {})
        // Load metrics + commit files from DB for the summary
        if (activeProject && (task.status === 'done' || task.status === 'review')) {
            Promise.all([
                window.relayAPI.taskMetrics(activeProject.id),
                task.commitHash ? window.relayAPI.gitCommitFiles(activeProject.id, task.commitHash) : Promise.resolve([]),
            ]).then(([data, files]) => {
                const rows = data as Array<{ taskId: string; durationMs: number; toolCalls: number; tokensIn: number; tokensOut: number }>
                const row = rows.find(r => r.taskId === task.id)
                if (row) setDbMetrics({ durationMs: row.durationMs, toolCalls: row.toolCalls, tokensIn: row.tokensIn, tokensOut: row.tokensOut, filesChanged: (files as string[]).length > 0 ? files as string[] : undefined })
            }).catch(() => {})
        }
    }, [task?.id, task?.status, activeProject, activityFeed]) // eslint-disable-line react-hooks/exhaustive-deps

    const taskActivity = useMemo(() => {
        if (!task) return []
        const inMemory = activityFeed.filter((a) => a.taskId === task.id)
        return inMemory.length > 0 ? inMemory : persistedLogs
    }, [task, activityFeed, persistedLogs])
    const groupedActivity = useMemo(() => groupActions(taskActivity), [taskActivity])

    if (!task) return null

    const isActiveTask = task.id === currentTaskId && task.status === 'in_progress'
    const isPausedInProgress = task.status === 'in_progress' && loopState === 'paused'
    const isCompleted = task.status === 'done'
    const displayLabel = isPausedInProgress ? 'Paused' : statusLabels[task.status]
    const criteriaItems = task.acceptanceCriteria ? parseCriteria(task.acceptanceCriteria) : []

    return (
        <div className="absolute right-0 top-0 w-[420px] bg-[var(--color-sidebar)] flex flex-col h-full overflow-hidden border-l border-border/50 shadow-xl z-20">
            {/* ── Header ── */}
            <div className="px-5 pt-5 pb-4 border-b border-border/40">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        {/* Status row */}
                        <div className="flex items-center gap-2 mb-2.5">
                            <button
                                onClick={() => setViewingStory({ storyId: task.storyId, prdId: task.prdId })}
                                className="text-[11px] font-mono text-muted-foreground hover:text-primary hover:underline transition-colors"
                                title={`View ${task.storyId} in spec`}
                            >
                                {task.storyId}
                            </button>
                            <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                                isPausedInProgress
                                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                    : task.status === 'in_progress'
                                        ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400'
                                        : task.status === 'review'
                                            ? 'bg-stone-500/10 text-stone-700 dark:bg-amber-500/10 dark:text-amber-400'
                                            : task.status === 'failed'
                                                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                                : isCompleted
                                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                                    : 'bg-muted text-muted-foreground'
                            }`}>
                                {isPausedInProgress ? <Pause className="h-3 w-3" /> : statusIcons[task.status]}
                                {displayLabel}
                            </span>
                            {isActiveTask && !isPausedInProgress && (
                                <span className="text-[10px] text-teal-600 dark:text-teal-400 font-medium">
                                    Active
                                </span>
                            )}
                        </div>
                        {/* Title */}
                        <h2 className="text-[16px] font-semibold leading-snug">{task.title}</h2>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 -mt-0.5" onClick={() => setSelectedTaskId(null)}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Meta strip */}
                <div className="flex items-center gap-3 mt-3">
                    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${priorityBadgeColors[task.priority as keyof typeof priorityBadgeColors] || 'bg-muted text-muted-foreground'}`}>
                        {task.priority}
                    </span>
                    {task.passes > 0 && (
                        <span className="text-[11px] text-muted-foreground">
                            {task.passes} {task.passes === 1 ? 'pass' : 'passes'}
                        </span>
                    )}
                </div>

                {/* Review CTA */}
                {task.status === 'review' && (
                    <Button
                        size="sm"
                        className="mt-3 w-full bg-stone-600 hover:bg-stone-700 dark:bg-amber-600 dark:hover:bg-amber-700 text-white text-[13px]"
                        onClick={() => setReviewingTaskId(task.id)}
                    >
                        <Eye className="h-3.5 w-3.5 mr-1.5" />
                        Review Changes
                    </Button>
                )}

                {/* Retry CTA for failed tasks */}
                {task.status === 'failed' && (
                    <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 w-full text-[13px]"
                        onClick={() => {
                            window.relayAPI.updateTask(task.id, { status: 'pending' })
                            useRelayStore.getState().updateTask(task.id, { status: 'pending' })
                        }}
                    >
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                        Retry Task
                    </Button>
                )}
            </div>

            {/* ── Scrollable Content ── */}
            <div className="flex-1 overflow-auto">
                {/* Description */}
                <div className="px-5 py-4 border-b border-border/30">
                    <SectionLabel>Description</SectionLabel>
                    <div className="text-[13px] text-foreground leading-[1.7] mt-1.5">
                        <FormattedDescription text={task.description} />
                    </div>
                </div>

                {/* Acceptance Criteria */}
                {criteriaItems.length > 0 && (
                    <div className="px-5 py-4 border-b border-border/30">
                        <SectionLabel>Acceptance Criteria</SectionLabel>
                        <ul className="mt-2 space-y-1.5">
                            {criteriaItems.map((item, i) => (
                                <li key={i} className="flex items-start gap-2 text-[13px] text-foreground/90 leading-relaxed">
                                    <SquareCheck className="h-3.5 w-3.5 shrink-0 mt-[3px] text-muted-foreground" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Rejection Notes */}
                {task.rejectionNotes && (
                    <div className="px-5 py-4 border-b border-border/30">
                        <SectionLabel>Rejection Notes</SectionLabel>
                        <div className="mt-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2.5">
                            <p className="text-[13px] text-rose-600 dark:text-rose-400 leading-relaxed whitespace-pre-wrap">
                                {task.rejectionNotes}
                            </p>
                        </div>
                    </div>
                )}

                {/* Git Commit */}
                {task.status === 'done' && task.commitHash && (
                    <div className="px-5 py-4 border-b border-border/30">
                        <SectionLabel>Commit</SectionLabel>
                        <div className="flex items-center gap-2.5 mt-2 px-3 py-2 rounded-lg bg-muted/60 border border-border/50">
                            <GitCommit className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-[11px] font-mono text-primary">{task.commitHash.slice(0, 7)}</span>
                            <span className="text-[12px] text-muted-foreground truncate">
                                feat({task.storyId}): {task.title}
                            </span>
                        </div>
                    </div>
                )}

                {/* Activity / Summary */}
                <div className="px-5 py-4">
                    {isCompleted && (taskActivity.length > 0 || dbMetrics) ? (
                        <CollapsibleSection title="Summary" defaultOpen>
                            <CompletedTaskSummary activity={taskActivity} dbMetrics={dbMetrics} />
                        </CollapsibleSection>
                    ) : (
                        <CollapsibleSection title="Activity" defaultOpen>
                            {taskActivity.length > 0 ? (
                                <div className="space-y-0.5">
                                    {groupedActivity.map((item) =>
                                        isActionGroup(item) ? (
                                            <ActionBlock key={item.id} action={item} />
                                        ) : (
                                            <TextBlock key={item.id} log={item} />
                                        )
                                    )}
                                </div>
                            ) : (
                                <p className="text-[13px] text-muted-foreground italic">
                                    {isActiveTask ? 'Waiting for activity...' : 'No activity recorded yet.'}
                                </p>
                            )}
                        </CollapsibleSection>
                    )}
                </div>
            </div>
        </div>
    )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {children}
        </h3>
    )
}
