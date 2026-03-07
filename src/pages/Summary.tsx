import { useEffect, useState } from 'react'
import { ProjectSummary } from '@/components/ProjectSummary'
import { TaskMetricsTable } from '@/components/TaskMetricsTable'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'

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
  modelBreakdown: Array<{ model: string; label: string; tokensIn: number; tokensOut: number; cost: number }>
}

interface TaskMetricRow {
  taskId: string
  storyId: string
  title: string
  status: string
  passes: number
  durationMs: number
  tokensIn: number
  tokensOut: number
  toolCalls: number
  cost: number
  model: string | null
  modelLabel: string
}

interface SummaryProps {
  projectId: string
}

export function Summary({ projectId }: SummaryProps) {
  const [projectMetrics, setProjectMetrics] = useState<ProjectMetrics | null>(null)
  const [taskMetrics, setTaskMetrics] = useState<TaskMetricRow[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const loadMetrics = async () => {
    setLoading(true)
    try {
      const [pm, tm] = await Promise.all([
        window.relayAPI.projectMetrics(projectId),
        window.relayAPI.taskMetrics(projectId),
      ])
      setProjectMetrics(pm as ProjectMetrics)
      setTaskMetrics(tm as TaskMetricRow[])
    } catch (err) {
      console.error('Failed to load metrics:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMetrics()
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleExport = async () => {
    setExporting(true)
    try {
      const data = await window.relayAPI.exportMetrics(projectId)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `relay-metrics-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export metrics:', err)
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading metrics...
      </div>
    )
  }

  if (!projectMetrics) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Failed to load metrics.
      </div>
    )
  }

  return (
    <div className="p-6 overflow-auto h-full space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Project Summary</h2>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
          <Download className="h-4 w-4 mr-1.5" />
          {exporting ? 'Exporting...' : 'Export JSON'}
        </Button>
      </div>

      <ProjectSummary metrics={projectMetrics} />

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Per-Task Metrics</h3>
        <TaskMetricsTable tasks={taskMetrics} />
      </div>
    </div>
  )
}
