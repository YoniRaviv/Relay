import { useState } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { formatDuration } from '@/shared/formatters'
import { statusColors, statusLabels } from '@/shared/constants/statusMaps'
import type { TaskMetricRow } from '@/shared/types/metrics'

interface TaskMetricsTableProps {
    tasks: TaskMetricRow[]
}

type SortKey = keyof TaskMetricRow
type SortDir = 'asc' | 'desc'

const columns: { key: SortKey; label: string; align?: 'right'; width?: string }[] = [
    { key: 'storyId', label: 'Story' },
    { key: 'title', label: 'Title' },
    { key: 'status', label: 'Status' },
    { key: 'modelLabel', label: 'Model' },
    { key: 'passes', label: 'Passes', align: 'right', width: 'w-16' },
    { key: 'durationMs', label: 'Duration', align: 'right', width: 'w-20' },
    { key: 'tokensIn', label: 'Tokens In', align: 'right' },
    { key: 'tokensOut', label: 'Tokens Out', align: 'right' },
    { key: 'toolCalls', label: 'Tools', align: 'right', width: 'w-16' },
    { key: 'cost', label: 'Cost', align: 'right', width: 'w-20' },
]

export function TaskMetricsTable({ tasks }: TaskMetricsTableProps) {
    const [sortKey, setSortKey] = useState<SortKey>('storyId')
    const [sortDir, setSortDir] = useState<SortDir>('asc')

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        } else {
            setSortKey(key)
            setSortDir('asc')
        }
    }

    const sorted = [...tasks].sort((a, b) => {
        const aVal = a[sortKey]
        const bVal = b[sortKey]
        const cmp = typeof aVal === 'string'
            ? aVal.localeCompare(bVal as string)
            : (aVal as number) - (bVal as number)
        return sortDir === 'asc' ? cmp : -cmp
    })

    const SortIcon = ({ col }: { col: SortKey }) => {
        if (sortKey !== col) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-0 group-hover:opacity-50" />
        return sortDir === 'asc'
            ? <ArrowUp className="ml-1 h-3 w-3" />
            : <ArrowDown className="ml-1 h-3 w-3" />
    }

    return (
        <div className="rounded-lg bg-card overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr>
                            {columns.map(col => (
                                <th
                                    key={col.key}
                                    className={`px-4 py-3 font-medium text-xs text-muted-foreground uppercase tracking-wider ${col.align === 'right' ? 'text-right' : 'text-left'} ${col.width ?? ''}`}
                                >
                                    <button
                                        className="group inline-flex items-center hover:text-foreground transition-colors"
                                        onClick={() => handleSort(col.key)}
                                    >
                                        {col.label}
                                        <SortIcon col={col.key} />
                                    </button>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((task, i) => (
                            <tr
                                key={task.taskId}
                                className={`hover:bg-accent/30 transition-colors ${
                                    i % 2 === 0 ? '' : 'bg-muted/20'
                                }`}
                            >
                                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{task.storyId}</td>
                                <td className="px-4 py-2.5 max-w-[220px] truncate">{task.title}</td>
                                <td className="px-4 py-2.5">
                                    <span className={`text-xs font-medium ${statusColors[task.status] ?? ''}`}>
                                        {statusLabels[task.status] ?? task.status}
                                    </span>
                                </td>
                                <td className="px-4 py-2.5 text-xs text-muted-foreground">{task.modelLabel}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{task.passes}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{formatDuration(task.durationMs)}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{task.tokensIn.toLocaleString()}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{task.tokensOut.toLocaleString()}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{task.toolCalls}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{task.cost < 0.01 ? '<$0.01' : `$${task.cost.toFixed(2)}`}</td>
                            </tr>
                        ))}
                        {sorted.length === 0 && (
                            <tr>
                                <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                                    No task metrics available yet.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
