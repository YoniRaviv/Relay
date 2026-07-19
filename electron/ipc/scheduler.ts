import { ipcMain } from 'electron';
import { openGlobalDb } from '../db/connection';
import {
  listJobs, createJob, getJob, updateJob, deleteJob, listJobEvents, failOpenRuns,
  type NewJobInput,
} from '../scheduler/db';
import { abortJob, startCaffeinate, stopCaffeinate, caffeinateState } from '../scheduler/service';

/** Board columns for the renderer (Slice 1: no chains → blocked folds into queue). */
function columns(db = openGlobalDb()) {
  const cols = { backlog: [] as unknown[], queue: [] as unknown[], running: [] as unknown[], needs_approval: [] as unknown[], done: [] as unknown[], failed: [] as unknown[] };
  for (const j of listJobs(db)) {
    if (j.status === 'failed') cols.failed.push(j);
    else if (j.status === 'blocked') cols.queue.push(j);
    else (cols as Record<string, unknown[]>)[j.status].push(j);
  }
  return cols;
}

export function registerSchedulerHandlers(): void {
  ipcMain.handle('scheduler:listJobs', () => columns());
  ipcMain.handle('scheduler:createJob', (_e, input: NewJobInput & { status?: string }) => {
    const db = openGlobalDb();
    const job = createJob(db, input);
    // Slice 1: creating a job queues it immediately (or arms it if scheduledFor is future).
    return updateJob(db, job.id, { status: 'queue' });
  });
  ipcMain.handle('scheduler:updateJob', (_e, id: string, patch: Record<string, unknown>) => {
    const db = openGlobalDb();
    if (!getJob(db, id)) return null;
    return updateJob(db, id, patch);
  });
  ipcMain.handle('scheduler:deleteJob', (_e, id: string) => {
    const db = openGlobalDb();
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
  ipcMain.handle('scheduler:getEvents', (_e, id: string, after = 0) => {
    const db = openGlobalDb();
    return listJobEvents(db, id, after);
  });
  ipcMain.handle('scheduler:caffeinateStart', (_e, seconds: number) => startCaffeinate(seconds));
  ipcMain.handle('scheduler:caffeinateStop', () => stopCaffeinate());
  ipcMain.handle('scheduler:caffeinateState', () => caffeinateState());
}
