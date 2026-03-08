export interface FileChange {
        path: string
        insertions: number
        deletions: number
        status: 'new' | 'modified' | 'deleted' | 'renamed'
}
