import { ipcMain } from 'electron';
import { openGlobalDb } from '../db/connection';
import {
  listJobs, createJob, getJob, updateJob, deleteJob, listJobEvents, failOpenRuns,
  type NewJobInput,
} from '../scheduler/db';
import { abortJob, resumeJob, rearmIfRecurring, startCaffeinate, stopCaffeinate, caffeinateState } from '../scheduler/service';
import { nextOccurrence } from '../scheduler/schedule';

/** Board columns for the renderer (blocked folds into queue until chains land in Slice 4). */
function columns(db = openGlobalDb()) {
  const cols = { backlog: [] as unknown[], queue: [] as unknown[], running: [] as unknown[], needs_approval: [] as unknown[], done: [] as unknown[], failed: [] as unknown[] };
  for (const j of listJobs(db)) {
    if (j.status === 'failed') cols.failed.push(j);
    else if (j.status === 'blocked') cols.queue.push(j);
    else (cols as Record<string, unknown[]>)[j.status].push(j);
  }
  return cols;
}

/** Hand a needs_approval job back to its live session; the resume run owns the next transition. */
function resolveGate(id: string, message: string) {
  const db = openGlobalDb();
  const j = getJob(db, id);
  if (!j || j.status !== 'needs_approval') return null;
  // ccJobId cleared + fresh startedAt: the resume gets its own watchdog window.
  const running = updateJob(db, id, { status: 'running', ccJobId: null, startedAt: Date.now(), finishedAt: null });
  resumeJob(running, message);
  return running;
}

export function registerSchedulerHandlers(): void {
  ipcMain.handle('scheduler:listJobs', () => columns());
  ipcMain.handle('scheduler:createJob', (_e, input: NewJobInput & { status?: string }) => {
    const db = openGlobalDb();
    // Recurring: arm at the next occurrence unless the caller set an explicit first run.
    // An invalid spec is a renderer bug (the picker is the only producer) — reject loudly.
    let scheduledFor = input.scheduledFor ?? null;
    if (input.scheduleCron) {
      const next = nextOccurrence(input.scheduleCron, Date.now());
      if (next == null) throw new Error(`Invalid recurrence spec: ${input.scheduleCron}`);
      if (scheduledFor == null) scheduledFor = next;
    }
    const job = createJob(db, { ...input, scheduledFor });
    return updateJob(db, job.id, { status: 'queue' });
  });
  ipcMain.handle('scheduler:updateJob', (_e, id: string, patch: Record<string, unknown>) => {
    const db = openGlobalDb();
    if (!getJob(db, id)) return null;
    return updateJob(db, id, patch);
  });
  ipcMain.handle('scheduler:deleteJob', (_e, id: string) => {
    const db = openGlobalDb();
    abortJob(id);
    return deleteJob(db, id);
  });
  ipcMain.handle('scheduler:cancelJob', (_e, id: string) => {
    const db = openGlobalDb();
    const j = getJob(db, id);
    if (!j || j.status !== 'running') return null;
    abortJob(id);
    failOpenRuns(db, id, 'cancelled', 'cancelled by user');
    return updateJob(db, id, { status: 'failed', failureReason: 'cancelled', finishedAt: Date.now() });
  });
  ipcMain.handle('scheduler:approveJob', (_e, id: string) =>
    resolveGate(id, 'The proposal is approved. Implement it and complete the job.'));
  ipcMain.handle('scheduler:editJob', (_e, id: string, amendedProposal: string) => {
    const amended = amendedProposal?.trim();
    if (!amended) throw new Error('amendedProposal required');
    return resolveGate(id, `Proceed with this amended proposal instead:\n\n${amended}`);
  });
  ipcMain.handle('scheduler:rejectJob', (_e, id: string) => {
    const db = openGlobalDb();
    const j = getJob(db, id);
    if (!j || j.status !== 'needs_approval') return null;
    // Standalone: done — the proposal stays as a record, nothing is applied. Chain member
    // (Slice 4): failed, so the chain cascades instead of a successor inheriting a rejected
    // proposal. Recurring jobs re-arm either way (terminal-state rule from Slice 2).
    const term = j.chainId != null
      ? updateJob(db, id, { status: 'failed', failureReason: 'proposal rejected', finishedAt: Date.now() })
      : updateJob(db, id, { status: 'done', finishedAt: Date.now() });
    return rearmIfRecurring(db, term) ?? term;
  });
  ipcMain.handle('scheduler:getEvents', (_e, id: string, after = 0) => {
    const db = openGlobalDb();
    return listJobEvents(db, id, after);
  });
  ipcMain.handle('scheduler:caffeinateStart', (_e, seconds: number) => startCaffeinate(seconds));
  ipcMain.handle('scheduler:caffeinateStop', () => stopCaffeinate());
  ipcMain.handle('scheduler:caffeinateState', () => caffeinateState());
}
