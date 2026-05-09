export interface ScorerResult {
    name: string;
    passed: boolean;
    score?: number;
    detail?: string;
}

export interface EvalRun {
    caseId: string;
    output: string;
    usage: { input_tokens: number; output_tokens: number };
    scorers: ScorerResult[];
    durationMs: number;
}

export interface SuiteSummary {
    total: number;
    passed: number;
    failed: number;
    avgScore?: number;
}

export interface SuiteReport {
    suite: string;
    promptVersion: string;
    model: string;
    timestamp: string;
    runs: EvalRun[];
    summary: SuiteSummary;
}
