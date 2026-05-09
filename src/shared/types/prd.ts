export interface DecomposedTask {
        storyId: string
        title: string
        description: string
        acceptanceCriteria: string
        priority: 'high' | 'medium' | 'low'
        userStoriesCovered?: string[]
}
