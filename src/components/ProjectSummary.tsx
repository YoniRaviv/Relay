import { MetricCard } from '@/components/MetricCard'
import {
  CheckCircle2, Clock, Hash, Zap, RotateCcw, Target, ListChecks, DollarSign, Cpu,
} from 'lucide-react'

interface ModelBreakdown {
  model: string
  label: string
  tokensIn: number
  tokensOut: number
  cost: number
}

interface ProjectMetrics {
  totalTasks: number
  completedTasks: number
  pendingTasks: number
  inProgressTasks: number
  completionRate: number
  totalBuildTimeMs: number
  totalTokensIn: number
  totalTokensOut: number
  totalToolCalls: number
  avgPasses: number
  firstPassSuccessRate: number
  totalCost: number
  modelBreakdown: ModelBreakdown[]
}

interface ProjectSummaryProps {
  metrics: ProjectMetrics
}

function formatDuration(ms: number): string {
  if (ms === 0) return '0s'
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSec = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainingSec}s`
  const hours = Math.floor(minutes / 60)
  const remainingMin = minutes % 60
  return `${hours}h ${remainingMin}m`
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function formatCost(cost: number): string {
  if (cost < 0.01) return '<$0.01'
  return `$${cost.toFixed(2)}`
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
