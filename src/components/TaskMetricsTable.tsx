import { useState } from 'react'
import { ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

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
}

interface TaskMetricsTableProps {
  tasks: TaskMetricRow[]
}

type SortKey = keyof TaskMetricRow
type SortDir = 'asc' | 'desc'

function formatDuration(ms: number): string {
  if (ms === 0) return '-'
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSec = seconds % 60
  return `${minutes}m ${remainingSec}s`
}

const statusColors: Record<string, string> = {
  pending: 'bg-zinc-500/20 text-zinc-400',
  in_progress: 'bg-blue-500/20 text-blue-400',
  review: 'bg-amber-500/20 text-amber-400',
  failed: 'bg-red-500/20 text-red-400',
  done: 'bg-green-500/20 text-green-400',
  approved: 'bg-emerald-500/20 text-emerald-400',
}

const columns: { key: SortKey; label: string; align?: 'right' }[] = [
  { key: 'storyId', label: 'Story' },
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status' },
  { key: 'passes', label: 'Passes', align: 'right' },
  { key: 'durationMs', label: 'Duration', align: 'right' },
  { key: 'tokensIn', label: 'Tokens In', align: 'right' },
  { key: 'tokensOut', label: 'Tokens Out', align: 'right' },
  { key: 'toolCalls', label: 'Tool Calls', align: 'right' },
  { key: 'cost', label: 'Cost', align: 'right' },
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

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-3 py-2 font-medium text-muted-foreground ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    <ArrowUpDown className="ml-1 h-3 w-3" />
                  </Button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(task => (
              <tr key={task.taskId} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="px-3 py-2 font-mono text-xs">{task.storyId}</td>
                <td className="px-3 py-2 max-w-[200px] truncate">{task.title}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[task.status] ?? ''}`}>
                    {task.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{task.passes}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatDuration(task.durationMs)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{task.tokensIn.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">{task.tokensOut.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">{task.toolCalls}</td>
                <td className="px-3 py-2 text-right tabular-nums">{task.cost < 0.01 ? '<$0.01' : `$${task.cost.toFixed(2)}`}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
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
