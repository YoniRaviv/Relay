import path from 'node:path';
import type { ScheduledJob, OutputType, Status } from './types';
import { tasksRoot } from './config';

/** JSON-schema for the run's structured result (SDK `outputFormat`). */
export const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['done', 'needs-approval', 'failed'] },
    output: { type: 'string' },
    assumptions: { type: 'array', items: { type: 'string' } },
  },
  required: ['status', 'output', 'assumptions'],
} as const;

const ALLOWED_TOOLS: Record<OutputType, string> = {
  md: 'Write Edit Read',
  pr: 'Write Edit Read Bash',
  artifact: 'Write Edit Read Skill',
};

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'result';
}

/** MD deliverable filename — job-named so vault-bound results don't collide on `result.md`. */
export function mdFilename(job: ScheduledJob): string {
  return `${slug(job.name)}.md`;
}

function deliverable(job: ScheduledJob): string {
  if (job.outputType === 'pr') return 'Make the change, commit it, and open a pull request with `gh pr create`; use output=<the PR URL>.';
  if (job.outputType === 'artifact') return 'Publish your deliverable as an Artifact; use output=<the Artifact URL>.';
  const f = mdFilename(job);
  return `Write your deliverable to a file named ${f} in the current working directory; use output="${f}".`;
}

export function buildPrompt(job: ScheduledJob): string {
  const lines: string[] = [];
  if (job.dodCondition?.trim()) {
    const cap = job.maxTurns ? ` — or stop after ${job.maxTurns} turns` : '';
    lines.push(`/goal ${job.dodCondition.trim()}${cap}`, '');
  }
  if (job.skill?.trim()) lines.push(`Use the ${job.skill.trim()} skill for this task.`, '');
  lines.push(
    `Working directory: ${jobCwd(job)}`,
    '',
    job.instructions.trim(),
    '',
    deliverable(job),
    'Then return structured output: status ("done" | "needs-approval" | "failed"), output (as described above), '
      + 'and assumptions (array of any assumptions you made; empty array if none).',
  );
  return lines.join('\n');
}

function tools(job: ScheduledJob): string { return job.allowedTools?.trim() || ALLOWED_TOOLS[job.outputType]; }
function perm(job: ScheduledJob): string { return job.permissionMode?.trim() || 'acceptEdits'; }

/** cwd for a job: an explicit working directory (git repo for PR, folder for MD) or its scratch workspace. */
export function jobCwd(job: ScheduledJob): string {
  return job.workingDir?.trim() || path.join(tasksRoot(), job.id);
}

/** Options passed to the Agent SDK `query()` for a job (fresh run or a resume). */
export interface QueryOptions {
  cwd: string;
  allowedTools: string[];
  permissionMode: string;
  settingSources: string[];
  model?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  outputFormat: { type: 'json_schema'; schema: typeof RESULT_SCHEMA };
  resume?: string;
  pathToClaudeCodeExecutable?: string;
}

export function buildQueryOptions(
  job: ScheduledJob,
  extra?: { resume?: string; pathToClaudeCodeExecutable?: string; maxBudgetUsd?: number },
): QueryOptions {
  return {
    cwd: jobCwd(job),
    allowedTools: tools(job).split(/\s+/),
    permissionMode: perm(job),
    settingSources: ['user', 'project'],
    ...(job.model?.trim() ? { model: job.model.trim() } : {}),
    ...(job.maxTurns ? { maxTurns: job.maxTurns } : {}),
    ...(extra?.maxBudgetUsd ? { maxBudgetUsd: extra.maxBudgetUsd } : {}),
    outputFormat: { type: 'json_schema', schema: RESULT_SCHEMA },
    ...(extra?.resume ? { resume: extra.resume } : {}),
    ...(extra?.pathToClaudeCodeExecutable ? { pathToClaudeCodeExecutable: extra.pathToClaudeCodeExecutable } : {}),
  };
}

/** The subset of the SDK `result` message that mapResult reads (kept SDK-type-free for testing). */
export interface ResultEnvelope {
  subtype?: string;
  structured_output?: { status?: string; output?: string; assumptions?: string[] } | null;
  usage?: { input_tokens?: number; output_tokens?: number };
  total_cost_usd?: number;
}

export interface MappedResult {
  status: Status;            // 'done' | 'needs_approval' | 'failed'
  resultRef?: string;
  assumptions: string[];
  tokens: number;
  costUsd?: number;
  failureReason?: string;
}

/** Map an SDK result envelope to a board outcome. Single source of truth for run + resume. */
export function mapResult(env: ResultEnvelope): MappedResult {
  const usage = env.usage ?? {};
  const tokens = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
  const costUsd = typeof env.total_cost_usd === 'number' ? env.total_cost_usd : undefined;
  const cost = costUsd !== undefined ? { costUsd } : {};
  const sr = env.structured_output;
  if (!sr || typeof sr.status !== 'string') {
    return { status: 'failed', failureReason: `run produced no structured result (${env.subtype ?? 'unknown'})`, assumptions: [], tokens, ...cost };
  }
  const assumptions = sr.assumptions ?? [];
  if (sr.status === 'failed') return { status: 'failed', failureReason: sr.output ?? '', assumptions, tokens, ...cost };
  if (sr.status === 'needs-approval') return { status: 'needs_approval', resultRef: sr.output ?? '', assumptions, tokens, ...cost };
  if (sr.status === 'done') return { status: 'done', resultRef: sr.output ?? '', assumptions, tokens, ...cost };
  return { status: 'failed', failureReason: `invalid result status: ${sr.status}`, assumptions, tokens, ...cost };
}
