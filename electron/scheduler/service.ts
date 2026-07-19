import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { BrowserWindow } from 'electron';
import { query, type Options, type PermissionMode, type SettingSource } from '@anthropic-ai/claude-agent-sdk';
import { openGlobalDb } from '../db/connection';
import {
  listJobs, getJob, updateJob, addJobEvent, createRun, finishRun, failOpenRuns, type RunStatus,
} from './db';
import { selectToStart, rearmPatch, selectToUnblock, selectToFailBlocked } from './schedule';
import { runLocalJob, type Sdk, type RunSink, type SdkMessage } from './runner';
import { jobCwd } from './dispatch';
import { POLL_INTERVAL_MS, LOCAL_CAP, WATCHDOG_TIMEOUT_MS, tasksRoot } from './config';
import { autoHold, autoRelease, stopAllCaffeinate } from './caffeinate';
import { notify } from './notify';
import { seedPlaybooks } from './seed';
import type { ScheduledJob } from './types';

let getWin: () => BrowserWindow | null = () => null;
let timer: ReturnType<typeof setInterval> | null = null;
const runs = new Map<string, AbortController>();
let shuttingDown = false;

function safeSend(channel: string, ...args: unknown[]): void {
  const win = getWin();
  if (!win) return;
  try {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(channel, ...args);
  } catch { /* suppress EPIPE / write-after-destroy */ }
}

let _claudePath: string | undefined;
function claudePath(): string {
  if (!_claudePath) {
    try { _claudePath = execFileSync('which', ['claude'], { encoding: 'utf-8' }).trim(); }
    catch { _claudePath = `${os.homedir()}/.local/bin/claude`; }
  }
  return _claudePath;
}

/** Subscription auth: strip API key, widen PATH (Electron GUI apps get a minimal PATH on macOS). */
function sdkEnv(): Record<string, string> {
  const { ANTHROPIC_API_KEY: _ANTHROPIC_API_KEY, CLAUDECODE: _CLAUDECODE, ...env } = process.env as Record<string, string>;
  const extra = [`${os.homedir()}/.local/bin`, '/usr/local/bin', '/opt/homebrew/bin'];
  env.PATH = [...extra, env.PATH ?? ''].join(':');
  return env;
}

const sdk: Sdk = ({ prompt, options }) => {
  const opts: Options = {
    ...options,
    // dispatch.ts types permissionMode/settingSources as plain strings so dispatch.ts stays
    // SDK-free for testing; narrow them here to the SDK's literal unions (values still come
    // from the same allowed set the SDK expects — 'acceptEdits'/'plan'/etc. and 'user'/'project').
    permissionMode: options.permissionMode as PermissionMode,
    settingSources: options.settingSources as SettingSource[],
    env: sdkEnv(),
    pathToClaudeCodeExecutable: claudePath(),
  };
  return query({ prompt, options: opts }) as AsyncIterable<SdkMessage>;
};

function notifyJob(j: ScheduledJob | undefined): void {
  if (!j) return;
  if (j.status === 'done') notify(j.name, '✓ Done');
  else if (j.status === 'failed') notify(j.name, `✗ Failed: ${(j.failureReason ?? '').slice(0, 120)}`);
  else if (j.status === 'needs_approval') notify(j.name, 'Awaiting your approval');
}

/**
 * Terminal recurring jobs go back to queue armed at their next occurrence.
 * Returns the re-armed row, or undefined for one-off jobs / non-terminal states
 * (needs_approval keeps waiting for the gate; cancel bypasses the sinks on purpose —
 * cancelling is the user's way to halt a recurring job without deleting it).
 */
export function rearmIfRecurring(db: ReturnType<typeof openGlobalDb>, j: ScheduledJob | undefined): ScheduledJob | undefined {
  if (!j || (j.status !== 'done' && j.status !== 'failed')) return undefined;
  const patch = rearmPatch(j, Date.now());
  if (!patch) return undefined;
  const rearmed = updateJob(db, j.id, patch);
  addJobEvent(db, j.id, 'text', `Re-armed (${j.status}) — next run ${new Date(rearmed.scheduledFor!).toLocaleString()}`, null);
  return rearmed;
}

export function launchJob(job: ScheduledJob, extra?: { resume?: string; prompt?: string }): void {
  const db = openGlobalDb();
  const ac = new AbortController();
  runs.set(job.id, ac);
  const run = createRun(db, job.id);
  const base = job.totalTokens ?? 0;
  const baseCost = job.costUsd ?? 0;
  const sink: RunSink = {
    setSession: (id, sid) => { if (!getJob(db, id)?.ccSessionId) updateJob(db, id, { ccSessionId: sid }); },
    event: (id, type, text) => {
      if (!getJob(db, id)) return;
      addJobEvent(db, id, type, text, run.id);
      safeSend('scheduler:activity', { jobId: id, type, text, ts: Date.now() });
    },
    tokens: (id, total) => updateJob(db, id, { totalTokens: base + total }),
    finish: (id, r) => {
      // Quitting: DB may already be closed by main's before-quit — leave the job `running`
      // so the next launch (or reconcileOrphan on restart) auto-resumes it instead of throwing.
      if (shuttingDown) return;
      const j = getJob(db, id);
      if (!j || j.status === 'failed') return;
      finishRun(db, run.id, { status: r.status as RunStatus, totalTokens: r.tokens, costUsd: r.costUsd ?? null, failureReason: r.failureReason ?? null });
      updateJob(db, id, {
        status: r.status,
        ...(r.status === 'failed' ? { failureReason: r.failureReason } : { resultRef: r.resultRef, resultType: job.outputType }),
        assumptions: r.assumptions, totalTokens: base + r.tokens, costUsd: baseCost + (r.costUsd ?? 0),
        ...(r.status === 'needs_approval' ? {} : { finishedAt: Date.now() }),
      });
      const done = getJob(db, id);
      notifyJob(done);
      safeSend('scheduler:jobUpdated', rearmIfRecurring(db, done) ?? done);
    },
    fail: (id, reason) => {
      // Quitting: leave the job `running` in the DB so the next launch auto-resumes it.
      if (shuttingDown) return;
      const j = getJob(db, id);
      if (!j || j.status === 'failed') return;
      finishRun(db, run.id, { status: 'failed', failureReason: reason });
      updateJob(db, id, { status: 'failed', failureReason: reason, finishedAt: Date.now() });
      const failed = getJob(db, id);
      notifyJob(failed);
      safeSend('scheduler:jobUpdated', rearmIfRecurring(db, failed) ?? failed);
    },
  };
  const withAbort: Sdk = ({ prompt, options }) => sdk({ prompt, options: { ...options, abortController: ac } });
  void runLocalJob(job, withAbort, sink, extra).finally(() => { runs.delete(job.id); maybeReleaseCaffeinate(); });
}

export function resumeJob(job: ScheduledJob, message: string): void {
  launchJob(job, job.ccSessionId ? { resume: job.ccSessionId, prompt: message } : {});
}

/** Cancel a run in flight (Task 8's cancel handler). No-op if the job isn't currently running. */
export function abortJob(id: string): void {
  runs.get(id)?.abort();
}

/** Auto keep-awake: hold while anything runs; release when the run map drains. */
function maybeHoldCaffeinate(): void { autoHold(WATCHDOG_TIMEOUT_MS / 1000); }
function maybeReleaseCaffeinate(): void { if (runs.size === 0) autoRelease(); }

let ticking = false;
function tick(): void {
  if (ticking) return;
  ticking = true;
  try {
    const db = openGlobalDb();
    const jobs = listJobs(db);
    // Chain maintenance: hand a finished step's result to its successor; kill chains whose
    // step failed. Promoted jobs start on the NEXT tick (this tick's selections below were
    // computed before promotion).
    for (const { job: j, prev } of selectToUnblock(jobs)) {
      const ref = prev.resultRef?.trim();
      // md results are filenames relative to the predecessor's cwd — a successor step may
      // run in a different scratch workspace, so hand it an absolute path.
      const resolved = !ref ? '(none)'
        : /^(\/|https?:\/\/)/.test(ref) ? ref
        : path.join(prev.workspacePath ?? jobCwd(prev), ref);
      const promoted = updateJob(db, j.id, {
        status: 'queue',
        instructions: `${j.instructions}\n\nPrevious step result (${prev.resultType ?? 'md'}): ${resolved}`,
      });
      safeSend('scheduler:jobUpdated', promoted);
    }
    for (const { job: j, reason } of selectToFailBlocked(jobs)) {
      const failed = updateJob(db, j.id, { status: 'failed', failureReason: reason, finishedAt: Date.now() });
      notifyJob(failed);
      safeSend('scheduler:jobUpdated', failed);
    }
    // Refresh the auto hold every tick while anything is live — this is what keeps a
    // job running past WATCHDOG_TIMEOUT_MS from losing its keep-awake.
    if (runs.size > 0) autoHold(WATCHDOG_TIMEOUT_MS / 1000);
    const start = new Set(selectToStart(jobs, LOCAL_CAP, Date.now()).map((j) => j.id));
    for (const j of jobs) {
      try {
        if (j.status === 'queue' && start.has(j.id)) {
          const cwd = jobCwd(j);
          if (!j.workingDir?.trim()) fs.mkdirSync(cwd, { recursive: true });
          const running = updateJob(db, j.id, { status: 'running', workspacePath: cwd, startedAt: Date.now() });
          maybeHoldCaffeinate();
          launchJob(running);
          safeSend('scheduler:jobUpdated', running);
        } else if (j.status === 'running' && !runs.has(j.id)) {
          reconcileOrphan(db, j);
        }
      } catch (e) {
        updateJob(db, j.id, { status: 'failed', failureReason: String((e as Error).message), finishedAt: Date.now() });
      }
    }
  } catch (e) {
    console.error('[scheduler] tick failed:', e);
  } finally {
    ticking = false;
  }
}

/**
 * Robustness: a `running` job absent from the live run map is an orphan (app died mid-run).
 * If it has a persisted session, AUTO-RESUME it; else watchdog-fail once past the timeout.
 */
function reconcileOrphan(db: ReturnType<typeof openGlobalDb>, j: ScheduledJob): void {
  if (j.ccSessionId) {
    failOpenRuns(db, j.id, 'failed', 'superseded by resume');
    const resumed = updateJob(db, j.id, { startedAt: Date.now() });
    addJobEvent(db, j.id, 'text', 'Resuming after restart…', null);
    maybeHoldCaffeinate();
    launchJob(resumed, { resume: j.ccSessionId, prompt: 'Continue from where you left off and complete the job.' });
    return;
  }
  const age = Date.now() - (j.startedAt ?? Date.now());
  if (age >= WATCHDOG_TIMEOUT_MS) {
    failOpenRuns(db, j.id, 'failed', 'run lost (app restart)');
    updateJob(db, j.id, { status: 'failed', failureReason: 'run lost (app restart/crash); watchdog timeout', finishedAt: Date.now() });
    const lost = getJob(db, j.id);
    notifyJob(lost);
    safeSend('scheduler:jobUpdated', rearmIfRecurring(db, lost) ?? lost);
  }
}

export function startScheduler(win: () => BrowserWindow | null): void {
  getWin = win;
  shuttingDown = false;            // reset for dev-mode restarts
  fs.mkdirSync(tasksRoot(), { recursive: true });
  seedPlaybooks(openGlobalDb());  // create/migrate on boot + one-time starter playbooks
  tick();                         // immediate catch-up for anything due while closed
  timer = setInterval(tick, POLL_INTERVAL_MS);
}

export function stopScheduler(): void {
  shuttingDown = true;
  if (timer) { clearInterval(timer); timer = null; }
  for (const ac of runs.values()) { try { ac.abort(); } catch { /* ignore */ } }
  runs.clear();
  stopAllCaffeinate();
}

export { startCaffeinate, stopCaffeinate, caffeinateState } from './caffeinate';
