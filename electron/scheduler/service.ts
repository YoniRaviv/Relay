import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { BrowserWindow } from 'electron';
import { query, type Options, type PermissionMode, type SettingSource } from '@anthropic-ai/claude-agent-sdk';
import { openGlobalDb } from '../db/connection';
import {
  listJobs, getJob, updateJob, addJobEvent, createRun, finishRun, failOpenRuns, type RunStatus,
} from './db';
import { selectToStart } from './schedule';
import { runLocalJob, type Sdk, type RunSink, type SdkMessage } from './runner';
import { jobCwd } from './dispatch';
import { POLL_INTERVAL_MS, LOCAL_CAP, WATCHDOG_TIMEOUT_MS, tasksRoot } from './config';
import { startCaffeinate, stopCaffeinate } from './caffeinate';
import { notify } from './notify';
import type { ScheduledJob } from './types';

let getWin: () => BrowserWindow | null = () => null;
let timer: ReturnType<typeof setInterval> | null = null;
const runs = new Map<string, AbortController>();

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
      safeSend('scheduler:jobUpdated', done);
    },
    fail: (id, reason) => {
      const j = getJob(db, id);
      if (!j || j.status === 'failed') return;
      finishRun(db, run.id, { status: 'failed', failureReason: reason });
      updateJob(db, id, { status: 'failed', failureReason: reason, finishedAt: Date.now() });
      const failed = getJob(db, id);
      notifyJob(failed);
      safeSend('scheduler:jobUpdated', failed);
    },
  };
  const withAbort: Sdk = ({ prompt, options }) => sdk({ prompt, options: { ...options, abortController: ac } });
  void runLocalJob(job, withAbort, sink, extra).finally(() => { runs.delete(job.id); maybeReleaseCaffeinate(); });
}

export function resumeJob(job: ScheduledJob, message: string): void {
  launchJob(job, { resume: job.ccSessionId ?? '', prompt: message });
}

/** Cancel a run in flight (Task 8's cancel handler). No-op if the job isn't currently running. */
export function abortJob(id: string): void {
  runs.get(id)?.abort();
}

/** Auto keep-awake: hold while anything runs; release when the run map drains. */
function maybeHoldCaffeinate(): void { startCaffeinate(WATCHDOG_TIMEOUT_MS / 1000); }
function maybeReleaseCaffeinate(): void { if (runs.size === 0) stopCaffeinate(); }

let ticking = false;
function tick(): void {
  if (ticking) return;
  ticking = true;
  try {
    const db = openGlobalDb();
    const jobs = listJobs(db);
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
    notifyJob(getJob(db, j.id));
  }
}

export function startScheduler(win: () => BrowserWindow | null): void {
  getWin = win;
  fs.mkdirSync(tasksRoot(), { recursive: true });
  openGlobalDb();                 // create/migrate on boot
  tick();                         // immediate catch-up for anything due while closed
  timer = setInterval(tick, POLL_INTERVAL_MS);
}

export function stopScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
  for (const ac of runs.values()) { try { ac.abort(); } catch { /* ignore */ } }
  runs.clear();
  stopCaffeinate();
}

export { startCaffeinate, stopCaffeinate, caffeinateState } from './caffeinate';
