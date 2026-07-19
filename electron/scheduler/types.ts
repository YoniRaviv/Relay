export type Status = 'backlog' | 'queue' | 'blocked' | 'running' | 'needs_approval' | 'done' | 'failed';
export type OutputType = 'md' | 'pr' | 'artifact';

/** Run profile shared by ScheduledJob and Playbook (skill|prompt + how to run it). */
export interface RunProfile {
  skill: string | null;          // named skill to invoke (else inline prompt/instructions)
  model: string | null;          // e.g. 'sonnet' | 'opus' | null = CC default
  allowedTools: string | null;   // space-separated override; null = derive from outputType
  permissionMode: string | null; // e.g. 'acceptEdits' | 'plan'; null = acceptEdits
}

export interface ScheduledJob extends RunProfile {
  id: string;
  name: string;
  instructions: string;
  playbookId: string | null;
  chainId: string | null;        // shared by all jobs of one playbook run (multi-step only)
  chainStep: number | null;      // 0-based position in the chain
  prevTaskId: string | null;     // predecessor this step waits on while 'blocked'
  outputType: OutputType;
  dodCondition: string | null;
  requireApproval: boolean;     // gate: agent must propose + return needs-approval before finalizing
  maxTurns: number | null;
  workingDir: string | null;     // cwd the job runs in
  scheduledFor: number | null;   // epoch ms; armed while > now (waits in queue)
  scheduleCron: string | null;   // recurring schedule (re-arms after each fire); null = one-off
  status: Status;
  ccJobId: string | null;
  ccSessionId: string | null;
  workspacePath: string | null;
  resultType: OutputType | null;
  resultRef: string | null;
  assumptions: string[];
  totalTokens: number | null;
  costUsd: number | null;
  failureReason: string | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

/** One step of a multi-step playbook. Null skill/model/outputType inherit the playbook's value. */
export interface PlaybookStep {
  name: string;
  prompt: string;
  skill: string | null;
  model: string | null;
  outputType: OutputType | null;
}

/** Reusable job template + run profile; instantiated into a ScheduledJob by click or schedule. */
export interface Playbook extends RunProfile {
  id: string;
  name: string;
  prompt: string | null;
  steps: PlaybookStep[] | null;
  outputType: OutputType;
  dodCondition: string | null;
  maxTurns: number | null;
  createdAt: number;
  updatedAt: number;
}
