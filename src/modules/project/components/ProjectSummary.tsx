import { MetricCard } from '@/modules/metrics'
import { formatDuration, formatNumber, formatCost } from '@/shared/formatters'
import type { ProjectMetrics } from '@/shared/types/metrics'
import {
    CheckCircle2, Clock, Hash, Zap, RotateCcw, Target, ListChecks, DollarSign, Cpu,
} from 'lucide-react'

interface ProjectSummaryProps {
    metrics: ProjectMetrics
}

export function ProjectSummary({ metrics }: ProjectSummaryProps) {
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <MetricCard
                    icon={<ListChecks className="h-4 w-4" />}
                    label="Total Tasks"
                    value={metrics.totalTasks}
                    subtitle={`${metrics.pendingTasks} pending, ${metrics.inProgressTasks} in progress`}
                />
                <MetricCard
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    label="Completion Rate"
                    value={`${Math.round(metrics.completionRate * 100)}%`}
                    subtitle={`${metrics.completedTasks} of ${metrics.totalTasks} completed`}
                />
                <MetricCard
                    icon={<Clock className="h-4 w-4" />}
                    label="Total Build Time"
                    value={formatDuration(metrics.totalBuildTimeMs)}
                />
                <MetricCard
                    icon={<Hash className="h-4 w-4" />}
                    label="Total Tokens"
                    value={formatNumber(metrics.totalTokensIn + metrics.totalTokensOut)}
                    subtitle={`${formatNumber(metrics.totalTokensIn)} in / ${formatNumber(metrics.totalTokensOut)} out`}
                />
                <MetricCard
                    icon={<Zap className="h-4 w-4" />}
                    label="Tool Calls"
                    value={formatNumber(metrics.totalToolCalls)}
                />
                <MetricCard
                    icon={<RotateCcw className="h-4 w-4" />}
                    label="Avg Passes"
                    value={metrics.avgPasses}
                />
                <MetricCard
                    icon={<Target className="h-4 w-4" />}
                    label="First-Pass Success"
                    value={`${Math.round(metrics.firstPassSuccessRate * 100)}%`}
                />
                <MetricCard
                    icon={<DollarSign className="h-4 w-4" />}
                    label="Total Cost"
                    value={formatCost(metrics.totalCost)}
                />
            </div>

            {metrics.modelBreakdown.length > 0 && (
                <div className="rounded-lg bg-card p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Cpu className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cost by Model</h3>
                    </div>
                    <div className="space-y-2">
                        {metrics.modelBreakdown.map((m) => (
                            <div key={m.model} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">{m.label}</span>
                                    <span className="text-xs font-mono text-muted-foreground">{formatNumber(m.tokensIn + m.tokensOut)} tokens</span>
                                </div>
                                <span className="text-sm font-medium tabular-nums">{formatCost(m.cost)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
