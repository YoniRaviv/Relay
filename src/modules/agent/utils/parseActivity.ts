import type { TaskLog } from '@shared/types'
import type { ActionGroup, ActivityItem, TaskSummary } from '@/shared/types/activity'

interface ToolInfo {
    label: string
    category: 'read' | 'write' | 'execute' | 'other'
}

const TOOL_MAP: Record<string, ToolInfo> = {
    read_file: { label: 'Read file', category: 'read' },
    Read: { label: 'Read file', category: 'read' },
    write_file: { label: 'Write file', category: 'write' },
    Write: { label: 'Write file', category: 'write' },
    Edit: { label: 'Edit file', category: 'write' },
    MultiEdit: { label: 'Edit file', category: 'write' },
    list_files: { label: 'List files', category: 'read' },
    Glob: { label: 'Search files', category: 'read' },
    Grep: { label: 'Search code', category: 'read' },
    Bash: { label: 'Run command', category: 'execute' },
    WebFetch: { label: 'Web fetch', category: 'execute' },
    NotebookEdit: { label: 'Edit notebook', category: 'write' },
    task_complete: { label: 'Complete', category: 'other' },
}

export function categorizeToolName(name: string): ToolInfo {
    return TOOL_MAP[name] ?? { label: name, category: 'other' }
}

export function groupActions(logs: TaskLog[]): ActivityItem[] {
    const items: ActivityItem[] = []
    const pendingToolUses = new Map<string, ActionGroup>()

    for (const log of logs) {
        if (log.type === 'tool_use') {
            const info = categorizeToolName(log.toolName ?? '')
            const group: ActionGroup = {
                id: log.id,
                toolName: log.toolName ?? '',
                label: info.label,
                filePath: log.filePath,
                startTime: log.timestamp,
                toolUseLog: log,
                status: 'running',
                category: info.category,
            }

            if (log.toolUseId) {
                pendingToolUses.set(log.toolUseId, group)
            }
            items.push(group)
        } else if (log.type === 'tool_result' && log.toolUseId) {
            const group = pendingToolUses.get(log.toolUseId)
            if (group) {
                group.resultLog = log
                group.endTime = log.timestamp
                group.status = log.content.startsWith('Error') ? 'error' : 'complete'
                pendingToolUses.delete(log.toolUseId)
            } else {
                items.push(log)
            }
        } else if (log.type === 'tool_result') {
            // Try adjacency fallback: pair with last pending group
            const lastItem = items[items.length - 1]
            if (lastItem && 'toolUseLog' in lastItem && lastItem.status === 'running') {
                lastItem.resultLog = log
                lastItem.endTime = log.timestamp
                lastItem.status = log.content.startsWith('Error') ? 'error' : 'complete'
            } else {
                items.push(log)
            }
        } else {
            items.push(log)
        }
    }

    // Post-pass: any ActionGroup still "running" that isn't the very last item
    // was never paired with a tool_result (e.g. CLI engine). Mark as complete.
    for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if ('toolUseLog' in item && item.status === 'running' && i < items.length - 1) {
            item.status = 'complete'
            // Use next log's timestamp as approximate end time
            const next = items[i + 1]
            item.endTime = 'timestamp' in next ? next.timestamp : ('startTime' in next ? next.startTime : undefined)
        }
    }

    return items
}

const WRITE_TOOLS = new Set(['write_file', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const READ_TOOLS = new Set(['read_file', 'Read', 'list_files', 'Glob', 'Grep'])

export function buildTaskSummary(logs: TaskLog[]): TaskSummary {
    const toolLogs = logs.filter(l => l.type === 'tool_use')
    const toolBreakdown: Record<string, number> = {}
    const filesModified = new Set<string>()
    const filesRead = new Set<string>()
    let completionSummary: string | undefined

    for (const log of toolLogs) {
        const name = log.toolName ?? ''
        const info = categorizeToolName(name)
        toolBreakdown[info.label] = (toolBreakdown[info.label] ?? 0) + 1

        if (log.filePath) {
            if (WRITE_TOOLS.has(name)) {
                filesModified.add(log.filePath)
            } else if (READ_TOOLS.has(name)) {
                filesRead.add(log.filePath)
            }
        }
    }

    // Find task_complete summary
    const completionLog = logs.find(l => l.toolName === 'task_complete' && l.type === 'text')
    if (completionLog) {
        completionSummary = completionLog.content
    }

    // Duration from first to last log
    let durationSec = 0
    if (logs.length > 1) {
        const first = new Date(logs[0].timestamp).getTime()
        const last = new Date(logs[logs.length - 1].timestamp).getTime()
        durationSec = Math.round((last - first) / 1000)
    }

    return {
        durationSec,
        toolCalls: toolLogs.length,
        toolBreakdown,
        filesModified: [...filesModified],
        filesRead: [...filesRead].filter(f => !filesModified.has(f)),
        completionSummary,
    }
}
