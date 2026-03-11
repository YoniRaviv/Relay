import type { TaskLog } from '@shared/types'

export interface ActionGroup {
    id: string
    toolName: string
    label: string
    filePath?: string
    startTime: string
    endTime?: string
    toolUseLog: TaskLog
    resultLog?: TaskLog
    status: 'running' | 'complete' | 'error'
    category: 'read' | 'write' | 'execute' | 'other'
}

export interface TaskSummary {
    durationSec: number
    toolCalls: number
    toolBreakdown: Record<string, number>
    filesModified: string[]
    filesRead: string[]
    completionSummary?: string
}

export type ActivityItem = ActionGroup | TaskLog

export function isActionGroup(item: ActivityItem): item is ActionGroup {
    return 'toolUseLog' in item
}
