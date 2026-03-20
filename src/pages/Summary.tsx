import { useEffect, useState } from 'react'
import { ProjectSummary } from '@/modules/project'
import { TaskMetricsTable } from '@/modules/metrics'
import { Button } from '@/components/ui/button'
import { Download, ChevronDown } from 'lucide-react'
import { useRelayStore } from '@/store/useRelayStore'
import type { ProjectMetrics, TaskMetricRow } from '@/shared/types/metrics'

interface SummaryProps {
    projectId: string
}

function extractTitle(description: string, title?: string | null): string {
    if (title) {
        return title.length > 40 ? title.slice(0, 40) + '...' : title
    }
    const first = description.split('\n')[0].trim()
    if (first.length > 40) return first.slice(0, 40) + '...'
    return first || 'Untitled Feature'
}

export function Summary({ projectId }: SummaryProps) {
    const { features, activePrdId } = useRelayStore()
    const [selectedPrdId, setSelectedPrdId] = useState<string | null>(activePrdId)
    const [projectMetrics, setProjectMetrics] = useState<ProjectMetrics | null>(null)
    const [taskMetrics, setTaskMetrics] = useState<TaskMetricRow[]>([])
    const [loading, setLoading] = useState(true)
    const [exporting, setExporting] = useState(false)
    const [showDropdown, setShowDropdown] = useState(false)

    const loadMetrics = async () => {
        setLoading(true)
        try {
            const [pm, tm] = await Promise.all([
                window.relayAPI.projectMetrics(projectId, selectedPrdId ?? undefined),
                window.relayAPI.taskMetrics(projectId, selectedPrdId ?? undefined),
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
    }, [projectId, selectedPrdId]) // eslint-disable-line react-hooks/exhaustive-deps

    // Sync with activePrdId when it changes externally
    useEffect(() => {
        setSelectedPrdId(activePrdId)
    }, [activePrdId])

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

    const selectedLabel = selectedPrdId
        ? extractTitle(features.find(f => f.id === selectedPrdId)?.description ?? '', features.find(f => f.id === selectedPrdId)?.title)
        : 'All Features'

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
                <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold">Summary</h2>

                    {/* Feature filter dropdown */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setShowDropdown(!showDropdown)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-muted/40 hover:bg-muted/70 transition-colors"
                        >
                            <span className="max-w-[200px] truncate">{selectedLabel}</span>
                            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                        </button>
                        {showDropdown && (
                            <div className="absolute top-full left-0 mt-1 min-w-[220px] max-h-64 overflow-auto rounded-md border border-border bg-card shadow-lg z-10">
                                <button
                                    type="button"
                                    onClick={() => { setSelectedPrdId(null); setShowDropdown(false) }}
                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 ${
                                        selectedPrdId === null ? 'bg-muted/70 font-medium text-foreground' : 'text-muted-foreground'
                                    }`}
                                >
                                    All Features
                                </button>
                                {features.map((f) => (
                                    <button
                                        key={f.id}
                                        type="button"
                                        onClick={() => { setSelectedPrdId(f.id); setShowDropdown(false) }}
                                        className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between gap-2 ${
                                            f.id === selectedPrdId ? 'bg-muted/70 font-medium text-foreground' : 'text-muted-foreground'
                                        }`}
                                    >
                                        <span className="truncate">{extractTitle(f.description, f.title)}</span>
                                        <span className="text-[10px] shrink-0">{f.doneCount}/{f.taskCount}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
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
