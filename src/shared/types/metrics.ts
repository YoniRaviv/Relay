export interface ModelBreakdown {
        model: string
        label: string
        tokensIn: number
        tokensOut: number
        cost: number
}

export interface ProjectMetrics {
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

export interface TaskMetricRow {
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
