import { Button } from '@/components/ui/button'
import { X, Eye, GitCommit } from 'lucide-react'
import { ActivityMessage } from '@/modules/agent'
import { useRelayStore } from '@/store/useRelayStore'
import { statusColors, statusLabels } from '@/shared/constants/statusMaps'

export function TaskDetail() {
    const { tasks, selectedTaskId, setSelectedTaskId, activityFeed, currentTaskId, setReviewingTaskId } = useRelayStore()
    const task = tasks.find((t) => t.id === selectedTaskId)

    if (!task) return null

    const isActiveTask = task.id === currentTaskId
    const taskActivity = activityFeed.filter((a) => a.taskId === task.id)

    return (
        <div className="w-96 bg-[var(--color-sidebar)] flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">{task.storyId}</span>
                    <span className={`text-xs font-medium ${statusColors[task.status]}`}>
                        {statusLabels[task.status]}
                    </span>
                    {isActiveTask && (
                        <span className="flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                            Active
                        </span>
                    )}
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedTaskId(null)}>
                    <X className="h-4 w-4" />
                </Button>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-4">
                <div>
                    <h2 className="text-lg font-semibold">{task.title}</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                        Priority: <span className="capitalize">{task.priority}</span>
                        {task.passes > 0 && <> &middot; Passes: {task.passes}</>}
                    </p>
                    {task.status === 'review' && (
                        <Button
                            size="sm"
                            className="mt-2 bg-amber-600 hover:bg-amber-700 text-white"
                            onClick={() => setReviewingTaskId(task.id)}
                        >
                            <Eye className="h-3.5 w-3.5 mr-1.5" />
                            Review Changes
                        </Button>
                    )}
                </div>

                <Section title="Description">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.description}</p>
                </Section>

                <Section title="Acceptance Criteria">
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap">{task.acceptanceCriteria}</div>
                </Section>

                {task.rejectionNotes && (
                    <Section title="Rejection Notes">
                        <p className="text-sm text-destructive whitespace-pre-wrap">{task.rejectionNotes}</p>
                    </Section>
                )}

                {(task.status === 'approved' || task.status === 'done') && task.commitHash && (
                    <Section title="Git">
                        <div className="flex items-center gap-2 p-2.5 rounded-md bg-muted/40 border border-border">
                            <GitCommit className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                                <span className="text-xs font-mono text-foreground">{task.commitHash.slice(0, 7)}</span>
                                <span className="text-xs text-muted-foreground ml-2">
                                    feat({task.storyId}): {task.title}
                                </span>
                            </div>
                        </div>
                    </Section>
                )}

                <Section title="Activity">
                    {taskActivity.length > 0 ? (
                        <div className="space-y-0.5">
                            {taskActivity.map((log) => (
                                <ActivityMessage key={log.id} log={log} />
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground italic">
                            {isActiveTask ? 'Waiting for activity...' : 'No activity recorded yet.'}
                        </p>
                    )}
                </Section>
            </div>
        </div>
    )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{title}</h3>
            {children}
        </div>
    )
}
