import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { ScheduledJob, Status, OutputType, Playbook, PlaybookStep } from './types';

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  playbook_id TEXT,
  output_type TEXT NOT NULL DEFAULT 'md',
  dod_condition TEXT,
  require_approval INTEGER NOT NULL DEFAULT 0,
  max_turns INTEGER,
  working_dir TEXT,
  skill TEXT,
  model TEXT,
  allowed_tools TEXT,
  permission_mode TEXT,
  scheduled_for INTEGER,
  schedule_cron TEXT,
  status TEXT NOT NULL DEFAULT 'backlog',
  cc_job_id TEXT,
  cc_session_id TEXT,
  chain_id TEXT,
  chain_step INTEGER,
  prev_task_id TEXT,
  workspace_path TEXT,
  result_type TEXT,
  result_ref TEXT,
  assumptions_json TEXT NOT NULL DEFAULT '[]',
  total_tokens INTEGER,
  failure_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

CREATE TABLE IF NOT EXISTS playbooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  skill TEXT,
  prompt TEXT,
  steps TEXT,
  model TEXT,
  allowed_tools TEXT,
  permission_mode TEXT,
  output_type TEXT NOT NULL DEFAULT 'md',
  dod_condition TEXT,
  max_turns INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS job_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_job_events_job ON job_events(job_id, id);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  total_tokens INTEGER,
  cost_usd REAL,
  failure_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_job ON runs(job_id, started_at DESC);
`;

// Additive columns introduced after the initial shipped schema (SQLite has no ADD COLUMN IF NOT EXISTS).
// Listing every post-initial column lets any existing db converge on open.
const ADDED_JOB_COLUMNS: [string, string][] = [
  ['working_dir', 'TEXT'], ['total_tokens', 'INTEGER'],
  ['skill', 'TEXT'], ['model', 'TEXT'], ['allowed_tools', 'TEXT'], ['permission_mode', 'TEXT'],
  ['scheduled_for', 'INTEGER'], ['schedule_cron', 'TEXT'],
  ['chain_id', 'TEXT'], ['chain_step', 'INTEGER'], ['prev_task_id', 'TEXT'],
  ['cost_usd', 'REAL'],
  ['require_approval', 'INTEGER NOT NULL DEFAULT 0'],
];

const ADDED_PLAYBOOK_COLUMNS: [string, string][] = [['steps', 'TEXT']];

export function initSchedulerSchema(db: DB): void {
  db.exec(SCHEMA);
  const have = new Set((db.prepare('PRAGMA table_info(jobs)').all() as { name: string }[]).map((c) => c.name));
  for (const [name, type] of ADDED_JOB_COLUMNS) {
    if (!have.has(name)) db.exec(`ALTER TABLE jobs ADD COLUMN ${name} ${type}`);
  }
  const havePb = new Set((db.prepare('PRAGMA table_info(playbooks)').all() as { name: string }[]).map((c) => c.name));
  for (const [name, type] of ADDED_PLAYBOOK_COLUMNS) {
    if (!havePb.has(name)) db.exec(`ALTER TABLE playbooks ADD COLUMN ${name} ${type}`);
  }
  const haveEv = new Set((db.prepare('PRAGMA table_info(job_events)').all() as { name: string }[]).map((c) => c.name));
  if (!haveEv.has('run_id')) db.exec('ALTER TABLE job_events ADD COLUMN run_id TEXT');
}

interface Row {
  id: string; name: string; instructions: string; playbook_id: string | null;
  chain_id: string | null; chain_step: number | null; prev_task_id: string | null;
  output_type: string; dod_condition: string | null; require_approval: number; max_turns: number | null;
  working_dir: string | null; skill: string | null; model: string | null;
  allowed_tools: string | null; permission_mode: string | null;
  scheduled_for: number | null; schedule_cron: string | null;
  status: string; cc_job_id: string | null; cc_session_id: string | null;
  workspace_path: string | null; result_type: string | null; result_ref: string | null;
  assumptions_json: string; total_tokens: number | null; failure_reason: string | null;
  cost_usd: number | null;
  created_at: number; updated_at: number; started_at: number | null; finished_at: number | null;
}

function rowToJob(r: Row): ScheduledJob {
  return {
    id: r.id, name: r.name, instructions: r.instructions, playbookId: r.playbook_id,
    chainId: r.chain_id, chainStep: r.chain_step, prevTaskId: r.prev_task_id,
    outputType: r.output_type as OutputType,
    dodCondition: r.dod_condition, requireApproval: !!r.require_approval, maxTurns: r.max_turns, workingDir: r.working_dir,
    skill: r.skill, model: r.model, allowedTools: r.allowed_tools, permissionMode: r.permission_mode,
    scheduledFor: r.scheduled_for, scheduleCron: r.schedule_cron,
    status: r.status as Status,
    ccJobId: r.cc_job_id, ccSessionId: r.cc_session_id,
    workspacePath: r.workspace_path,
    resultType: r.result_type as OutputType | null, resultRef: r.result_ref,
    assumptions: JSON.parse(r.assumptions_json), totalTokens: r.total_tokens, failureReason: r.failure_reason,
    costUsd: r.cost_usd,
    createdAt: r.created_at, updatedAt: r.updated_at, startedAt: r.started_at, finishedAt: r.finished_at,
  };
}

export interface NewJobInput {
  name: string; instructions?: string; outputType?: OutputType;
  dodCondition?: string | null; requireApproval?: boolean; maxTurns?: number | null;
  workingDir?: string | null;
  skill?: string | null; model?: string | null; allowedTools?: string | null; permissionMode?: string | null;
  scheduledFor?: number | null; scheduleCron?: string | null; playbookId?: string | null;
  chainId?: string | null; chainStep?: number | null; prevTaskId?: string | null;
}

export function createJob(db: DB, input: NewJobInput): ScheduledJob {
  const now = Date.now();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO jobs
       (id, name, instructions, output_type, dod_condition, require_approval, max_turns,
        working_dir, skill, model, allowed_tools, permission_mode,
        scheduled_for, schedule_cron, playbook_id, chain_id, chain_step, prev_task_id,
        status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'backlog', ?, ?)`,
  ).run(
    id, input.name, input.instructions ?? '', input.outputType ?? 'md',
    input.dodCondition ?? null, input.requireApproval ? 1 : 0, input.maxTurns ?? null,
    input.workingDir ?? null, input.skill ?? null, input.model ?? null,
    input.allowedTools ?? null, input.permissionMode ?? null,
    input.scheduledFor ?? null, input.scheduleCron ?? null, input.playbookId ?? null,
    input.chainId ?? null, input.chainStep ?? null, input.prevTaskId ?? null, now, now,
  );
  return getJob(db, id)!;
}

export function getJob(db: DB, id: string): ScheduledJob | undefined {
  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Row | undefined;
  return row ? rowToJob(row) : undefined;
}

export function listJobs(db: DB): ScheduledJob[] {
  const rows = db.prepare('SELECT * FROM jobs ORDER BY created_at ASC').all() as Row[];
  return rows.map(rowToJob);
}

export function deleteJob(db: DB, id: string): boolean {
  db.prepare('DELETE FROM job_events WHERE job_id = ?').run(id);
  db.prepare('DELETE FROM runs WHERE job_id = ?').run(id);
  return db.prepare('DELETE FROM jobs WHERE id = ?').run(id).changes > 0;
}

/** Distinct local working dirs used before, most-recently-used first, capped at 8 — for the job form's recent-dirs picker. */
export function listWorkingDirs(db: DB): string[] {
  const rows = db.prepare(
    "SELECT working_dir FROM jobs WHERE working_dir IS NOT NULL AND working_dir != '' GROUP BY working_dir ORDER BY MAX(created_at) DESC LIMIT 8",
  ).all() as { working_dir: string }[];
  return rows.map((r) => r.working_dir);
}

export interface JobEvent { id: number; jobId: string; ts: number; type: string; text: string; runId: string | null }

export function addJobEvent(db: DB, jobId: string, type: string, text: string, runId: string | null = null): void {
  db.prepare('INSERT INTO job_events (job_id, ts, type, text, run_id) VALUES (?, ?, ?, ?, ?)')
    .run(jobId, Date.now(), type, text, runId);
}

export function listJobEvents(db: DB, jobId: string, afterId = 0, runId: string | null = null): JobEvent[] {
  const rows = (runId
    ? db.prepare('SELECT * FROM job_events WHERE job_id = ? AND id > ? AND run_id = ? ORDER BY id ASC').all(jobId, afterId, runId)
    : db.prepare('SELECT * FROM job_events WHERE job_id = ? AND id > ? ORDER BY id ASC').all(jobId, afterId)
  ) as { id: number; job_id: string; ts: number; type: string; text: string; run_id: string | null }[];
  return rows.map((r) => ({ id: r.id, jobId: r.job_id, ts: r.ts, type: r.type, text: r.text, runId: r.run_id }));
}

// --- Runs ---------------------------------------------------------------

export type RunStatus = 'running' | 'done' | 'needs_approval' | 'failed' | 'cancelled';
export interface Run {
  id: string; jobId: string; status: RunStatus; startedAt: number; finishedAt: number | null;
  totalTokens: number | null; costUsd: number | null; failureReason: string | null;
}
interface RunRow { id: string; job_id: string; status: string; started_at: number; finished_at: number | null; total_tokens: number | null; cost_usd: number | null; failure_reason: string | null }
const rowToRun = (r: RunRow): Run => ({
  id: r.id, jobId: r.job_id, status: r.status as RunStatus, startedAt: r.started_at,
  finishedAt: r.finished_at, totalTokens: r.total_tokens, costUsd: r.cost_usd, failureReason: r.failure_reason,
});

export function createRun(db: DB, jobId: string): Run {
  const id = randomUUID();
  db.prepare('INSERT INTO runs (id, job_id, status, started_at) VALUES (?, ?, ?, ?)').run(id, jobId, 'running', Date.now());
  return rowToRun(db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as RunRow);
}

export function finishRun(db: DB, runId: string, patch: { status: RunStatus; totalTokens?: number | null; costUsd?: number | null; failureReason?: string | null }): void {
  db.prepare('UPDATE runs SET status = ?, finished_at = ?, total_tokens = ?, cost_usd = ?, failure_reason = ? WHERE id = ?')
    .run(patch.status, Date.now(), patch.totalTokens ?? null, patch.costUsd ?? null, patch.failureReason ?? null, runId);
}

/** Close any still-open runs for a job (watchdog / cancel paths). */
export function failOpenRuns(db: DB, jobId: string, status: 'failed' | 'cancelled', reason: string): void {
  db.prepare("UPDATE runs SET status = ?, finished_at = ?, failure_reason = ? WHERE job_id = ? AND status = 'running'")
    .run(status, Date.now(), reason, jobId);
}

export function listRuns(db: DB, jobId: string, limit = 10): Run[] {
  return (db.prepare('SELECT * FROM runs WHERE job_id = ? ORDER BY started_at DESC, rowid DESC LIMIT ?').all(jobId, limit) as RunRow[]).map(rowToRun);
}

export function latestRun(db: DB, jobId: string): Run | undefined {
  const row = db.prepare('SELECT * FROM runs WHERE job_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 1').get(jobId) as RunRow | undefined;
  return row ? rowToRun(row) : undefined;
}

export interface UsageJobRow { jobId: string; name: string; playbookId: string | null; runs: number; tokens: number; costUsd: number; lastRunAt: number | null }
export interface UsagePlaybookRow { playbookId: string; name: string; runs: number; tokens: number; costUsd: number }
export interface UsageDailyRow { day: string; runs: number; tokens: number; costUsd: number }
export interface UsageSummary { jobs: UsageJobRow[]; playbooks: UsagePlaybookRow[]; daily: UsageDailyRow[] }

/** Cost/usage aggregation over run history: per job, per playbook, and a 14-day daily trend. */
export function usageSummary(db: DB): UsageSummary {
  const jobs = db.prepare(`
    SELECT j.id AS jobId, j.name, j.playbook_id AS playbookId, COUNT(r.id) AS runs,
           COALESCE(SUM(r.total_tokens),0) AS tokens, COALESCE(SUM(r.cost_usd),0) AS costUsd, MAX(r.started_at) AS lastRunAt
    FROM jobs j JOIN runs r ON r.job_id = j.id GROUP BY j.id ORDER BY costUsd DESC`).all() as UsageJobRow[];
  const playbooks = db.prepare(`
    SELECT j.playbook_id AS playbookId, p.name, COUNT(r.id) AS runs,
           COALESCE(SUM(r.total_tokens),0) AS tokens, COALESCE(SUM(r.cost_usd),0) AS costUsd
    FROM runs r JOIN jobs j ON j.id = r.job_id JOIN playbooks p ON p.id = j.playbook_id
    GROUP BY j.playbook_id ORDER BY costUsd DESC`).all() as UsagePlaybookRow[];
  const daily = db.prepare(`
    SELECT date(started_at/1000,'unixepoch') AS day, COUNT(*) AS runs,
           COALESCE(SUM(total_tokens),0) AS tokens, COALESCE(SUM(cost_usd),0) AS costUsd
    FROM runs WHERE started_at > ? GROUP BY day ORDER BY day`).all(Date.now() - 14 * 86400_000) as UsageDailyRow[];
  return { jobs, playbooks, daily };
}

const COLS: Record<string, string> = {
  status: 'status', instructions: 'instructions', ccJobId: 'cc_job_id', ccSessionId: 'cc_session_id',
  workspacePath: 'workspace_path', resultType: 'result_type',
  resultRef: 'result_ref', failureReason: 'failure_reason', startedAt: 'started_at', finishedAt: 'finished_at',
  dodCondition: 'dod_condition', maxTurns: 'max_turns', workingDir: 'working_dir',
  skill: 'skill', model: 'model', allowedTools: 'allowed_tools', permissionMode: 'permission_mode',
  scheduledFor: 'scheduled_for', scheduleCron: 'schedule_cron', totalTokens: 'total_tokens',
  costUsd: 'cost_usd',
};

export function updateJob(db: DB, id: string, patch: Partial<ScheduledJob>): ScheduledJob {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'assumptions') { sets.push('assumptions_json = ?'); vals.push(JSON.stringify(v)); continue; }
    const col = Object.prototype.hasOwnProperty.call(COLS, k) ? COLS[k] : undefined;
    if (col) { sets.push(`${col} = ?`); vals.push(v); }
  }
  sets.push('updated_at = ?'); vals.push(Date.now());
  vals.push(id);
  db.prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return getJob(db, id)!;
}

// --- Playbooks ---------------------------------------------------------------

interface PlaybookRow {
  id: string; name: string; skill: string | null; prompt: string | null; steps: string | null;
  model: string | null; allowed_tools: string | null; permission_mode: string | null;
  output_type: string; dod_condition: string | null; max_turns: number | null;
  created_at: number; updated_at: number;
}

function rowToPlaybook(r: PlaybookRow): Playbook {
  return {
    id: r.id, name: r.name, skill: r.skill, prompt: r.prompt,
    steps: r.steps ? JSON.parse(r.steps) : null,
    model: r.model, allowedTools: r.allowed_tools, permissionMode: r.permission_mode,
    outputType: r.output_type as OutputType,
    dodCondition: r.dod_condition, maxTurns: r.max_turns, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export interface PlaybookInput {
  name: string; skill?: string | null; prompt?: string | null; steps?: PlaybookStep[] | null;
  model?: string | null; allowedTools?: string | null; permissionMode?: string | null;
  outputType?: OutputType; dodCondition?: string | null; maxTurns?: number | null;
}

export function createPlaybook(db: DB, input: PlaybookInput): Playbook {
  const now = Date.now();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO playbooks (id, name, skill, prompt, steps, model, allowed_tools, permission_mode,
        output_type, dod_condition, max_turns, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.name, input.skill ?? null, input.prompt ?? null,
    input.steps?.length ? JSON.stringify(input.steps) : null, input.model ?? null,
    input.allowedTools ?? null, input.permissionMode ?? null,
    input.outputType ?? 'md', input.dodCondition ?? null, input.maxTurns ?? null, now, now);
  return getPlaybook(db, id)!;
}

export function getPlaybook(db: DB, id: string): Playbook | undefined {
  const row = db.prepare('SELECT * FROM playbooks WHERE id = ?').get(id) as PlaybookRow | undefined;
  return row ? rowToPlaybook(row) : undefined;
}

export function listPlaybooks(db: DB): Playbook[] {
  return (db.prepare('SELECT * FROM playbooks ORDER BY created_at ASC').all() as PlaybookRow[]).map(rowToPlaybook);
}

const PB_COLS: Record<keyof PlaybookInput, string> = {
  name: 'name', skill: 'skill', prompt: 'prompt', steps: 'steps', model: 'model', allowedTools: 'allowed_tools',
  permissionMode: 'permission_mode', outputType: 'output_type',
  dodCondition: 'dod_condition', maxTurns: 'max_turns',
};

export function updatePlaybook(db: DB, id: string, patch: PlaybookInput): Playbook | undefined {
  if (!getPlaybook(db, id)) return undefined;
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'steps') { sets.push('steps = ?'); vals.push(v && (v as unknown[]).length ? JSON.stringify(v) : null); continue; }
    const col = Object.prototype.hasOwnProperty.call(PB_COLS, k) ? PB_COLS[k as keyof PlaybookInput] : undefined;
    if (col) { sets.push(`${col} = ?`); vals.push(v ?? null); }
  }
  sets.push('updated_at = ?'); vals.push(Date.now());
  db.prepare(`UPDATE playbooks SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  return getPlaybook(db, id);
}

export function deletePlaybook(db: DB, id: string): boolean {
  return db.prepare('DELETE FROM playbooks WHERE id = ?').run(id).changes > 0;
}
