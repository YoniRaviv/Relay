import { useEffect, useState } from 'react'
import { ArchiveRestore, CheckCircle2, FileText, ChevronLeft } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { useRelayStore, type FeatureSummary } from '@/store/useRelayStore'
import type { Task } from '@shared/types'
import type { ProjectMetrics, TaskMetricRow } from '@/shared/types/metrics'
import { extractTitle, formatDuration } from '@/shared/formatters'
import { toast } from 'sonner'

function StatCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
            <p className="text-lg font-semibold">{value}</p>
        </div>
    )
}

interface FeatureDetailProps {
    feature: FeatureSummary
    onBack: () => void
    onUnarchive: (prdId: string) => void
}

export function FeatureDetail({ feature, onBack, onUnarchive }: FeatureDetailProps) {
    const activeProject = useRelayStore(s => s.activeProject)
    const [tasks, setTasks] = useState<Task[]>([])
    const [metrics, setMetrics] = useState<ProjectMetrics | null>(null)
    const [taskMetrics, setTaskMetrics] = useState<TaskMetricRow[]>([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'overview' | 'prd' | 'tasks'>('overview')

    useEffect(() => {
        const load = async () => {
            setLoading(true)
            try {
                const [t, pm, tm] = await Promise.all([
                    window.relayAPI.listTasks(feature.projectId, feature.id),
                    activeProject ? window.relayAPI.projectMetrics(activeProject.id, feature.id) : null,
                    activeProject ? window.relayAPI.taskMetrics(activeProject.id, feature.id) : null,
                ])
                setTasks(t)
                if (pm) setMetrics(pm as ProjectMetrics)
                if (tm) setTaskMetrics(tm as TaskMetricRow[])
            } catch {
                toast.error('Failed to load feature data')
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [feature.id, feature.projectId, activeProject])

    const title = extractTitle(feature.description)

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Loading...
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border/30 shrink-0">
                <div className="flex items-center gap-3 mb-3">
                    <button
                        onClick={onBack}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-base font-semibold truncate">{title}</h2>
                        <p className="text-[11px] text-muted-foreground">
                            Archived &middot; {feature.taskCount} task{feature.taskCount !== 1 ? 's' : ''} completed
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs shrink-0"
                        onClick={() => onUnarchive(feature.id)}
                    >
                        <ArchiveRestore className="h-3.5 w-3.5" />
                        Unarchive
                    </Button>
                </div>

                {/* Tabs */}
                <div className="flex gap-1">
                    {(['overview', 'prd', 'tasks'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                                activeTab === tab
                                    ? 'bg-secondary text-secondary-foreground'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                            }`}
                        >
                            {tab === 'overview' ? 'Overview' : tab === 'prd' ? 'PRD' : `Tasks (${feature.taskCount})`}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-auto p-6">
                {activeTab === 'overview' && (
                    <div className="space-y-5">
                        {/* Stats grid */}
                        <div className="grid grid-cols-3 gap-3">
                            <StatCard label="Tasks" value={String(feature.taskCount)} />
                            <StatCard
                                label="Duration"
                                value={metrics?.totalBuildTimeMs ? formatDuration(metrics.totalBuildTimeMs) : '-'}
                            />
                            <StatCard
                                label="Cost"
                                value={metrics?.totalCost ? `$${metrics.totalCost.toFixed(2)}` : '-'}
                            />
                        </div>

                        {/* Task breakdown */}
                        {taskMetrics.length > 0 && (
                            <div>
                                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                                    Task Breakdown
                                </h3>
                                <div className="space-y-1.5">
                                    {taskMetrics.map(tm => (
                                        <div
                                            key={tm.taskId}
                                            className="flex items-center gap-3 px-3 py-2 rounded-md bg-muted/30 text-sm"
                                        >
                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                            <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                                                {tm.storyId}
                                            </span>
                                            <span className="flex-1 truncate">{tm.title}</span>
                                            {tm.durationMs > 0 && (
                                                <span className="text-[10px] text-muted-foreground shrink-0">
                                                    {formatDuration(tm.durationMs)}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Feature description preview */}
                        {feature.description && (
                            <div>
                                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                    Description
                                </h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    {feature.description}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'prd' && (
                    <div>
                        {feature.markdown ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none bg-muted/30 rounded-lg p-4">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {feature.markdown}
                                </ReactMarkdown>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <FileText className="h-8 w-8 text-muted-foreground/50 mb-3" />
                                <p className="text-sm text-muted-foreground">No PRD document available for this feature.</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'tasks' && (
                    <div className="space-y-1.5">
                        {tasks.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">No tasks</p>
                        ) : (
                            tasks.map(t => (
                                <div
                                    key={t.id}
                                    className="flex items-start gap-3 px-3 py-2.5 rounded-md bg-muted/30"
                                >
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className="font-mono text-[10px] text-muted-foreground">{t.storyId}</span>
                                            <span className="text-sm font-medium">{t.title}</span>
                                        </div>
                                        {t.description && (
                                            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                                                {t.description}
                                            </p>
                                        )}
                                    </div>
                                    {t.commitHash && (
                                        <span className="text-[10px] font-mono text-muted-foreground shrink-0 mt-0.5">
                                            {t.commitHash.slice(0, 7)}
                                        </span>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
