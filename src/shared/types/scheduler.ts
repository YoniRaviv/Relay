// Renderer-side mirror of electron/scheduler/types.ts — only the fields the UI needs.

export type JobStatus = 'backlog' | 'queue' | 'blocked' | 'running' | 'needs_approval' | 'done' | 'failed'
export type OutputType = 'md' | 'pr' | 'artifact'

export interface ScheduledJob {
    id: string
    name: string
    instructions: string
    status: JobStatus
    outputType: OutputType
    workingDir: string | null
    model: string | null
    scheduledFor: number | null
    scheduleCron: string | null
    chainStep: number | null
    requireApproval: boolean
    resultType: OutputType | null
    resultRef: string | null
    failureReason: string | null
    totalTokens: number | null
    costUsd: number | null
    createdAt: number
    startedAt: number | null
    finishedAt: number | null
}

/** Board columns as returned by `scheduler:listJobs`. */
export interface JobColumns {
    backlog: ScheduledJob[]
    queue: ScheduledJob[]
    running: ScheduledJob[]
    needs_approval: ScheduledJob[]
    done: ScheduledJob[]
    failed: ScheduledJob[]
}

/** Mirrors electron/scheduler/db.ts's JobEvent — one persisted activity row for a job. */
export interface JobEvent {
    id: number
    jobId: string
    ts: number
    type: string
    text: string
    runId: string | null
}

/** Mirrors electron/scheduler/types.ts Playbook/PlaybookStep — fields the UI needs. */
export interface PlaybookStep {
    name: string
    prompt: string
    skill: string | null
    model: string | null
    outputType: OutputType | null
}

export interface Playbook {
    id: string
    name: string
    prompt: string | null
    steps: PlaybookStep[] | null
    skill: string | null
    model: string | null
    allowedTools: string | null
    permissionMode: string | null
    outputType: OutputType
    dodCondition: string | null
    maxTurns: number | null
    createdAt: number
    updatedAt: number
}
