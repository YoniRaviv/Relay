import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { openGlobalDb } from '../db/connection';
import {
  listJobs, createJob, getJob, updateJob, deleteJob, listJobEvents, failOpenRuns,
  listWorkingDirs, listPlaybooks, getPlaybook, createPlaybook, updatePlaybook, deletePlaybook,
  listRuns, usageSummary,
  type NewJobInput, type PlaybookInput,
} from '../scheduler/db';
import { abortJob, resumeJob, rearmIfRecurring, startCaffeinate, stopCaffeinate, caffeinateState } from '../scheduler/service';
import { listAvailableSkills } from '../scheduler/skills';
import { nextOccurrence } from '../scheduler/schedule';
import type { PlaybookStep, ScheduledJob } from '../scheduler/types';

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

const STEP_OUTPUTS = new Set(['md', 'pr', 'artifact']);

/** Validate a client-supplied steps array; null/undefined means a step-less playbook. */
function parseSteps(raw: unknown): { steps: PlaybookStep[] | null } | { error: string } {
  if (raw == null) return { steps: null };
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'steps must be a non-empty array' };
  const steps: PlaybookStep[] = [];
  for (const s of raw) {
    if (typeof s !== 'object' || s === null) return { error: 'each step must be an object' };
    const { name, prompt, skill, model, outputType } = s as Record<string, unknown>;
    if (typeof name !== 'string' || !name.trim()) return { error: 'each step needs a name' };
    if (typeof prompt !== 'string' || !prompt.trim()) return { error: 'each step needs a prompt' };
    if (outputType != null && !STEP_OUTPUTS.has(outputType as string)) return { error: `invalid step outputType: ${String(outputType)}` };
    steps.push({
      name: name.trim(), prompt,
      skill: typeof skill === 'string' && skill.trim() ? skill.trim() : null,
      model: typeof model === 'string' && model.trim() ? model.trim() : null,
      outputType: (outputType as PlaybookStep['outputType']) ?? null,
    });
  }
  return { steps };
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
  ipcMain.handle('scheduler:getRuns', (_e, id: string) => listRuns(openGlobalDb(), id, 20));
  ipcMain.handle('scheduler:usage', () => usageSummary(openGlobalDb()));
  ipcMain.handle('scheduler:caffeinateStart', (_e, seconds: number) => startCaffeinate(seconds));
  ipcMain.handle('scheduler:caffeinateStop', () => stopCaffeinate());
  ipcMain.handle('scheduler:caffeinateState', () => caffeinateState());

  ipcMain.handle('scheduler:listWorkingDirs', () => listWorkingDirs(openGlobalDb()));
  ipcMain.handle('scheduler:listSkills', () => listAvailableSkills());

  ipcMain.handle('scheduler:listPlaybooks', () => listPlaybooks(openGlobalDb()));
  ipcMain.handle('scheduler:createPlaybook', (_e, input: PlaybookInput & { steps?: unknown }) => {
    if (!input.name?.trim()) throw new Error('name required');
    const parsed = parseSteps(input.steps);
    if ('error' in parsed) throw new Error(parsed.error);
    return createPlaybook(openGlobalDb(), { ...input, steps: parsed.steps });
  });
  ipcMain.handle('scheduler:updatePlaybook', (_e, id: string, patch: PlaybookInput & { steps?: unknown }) => {
    const parsed = parseSteps(patch.steps);
    if ('error' in parsed) throw new Error(parsed.error);
    return updatePlaybook(openGlobalDb(), id, { ...patch, steps: parsed.steps }) ?? null;
  });
  ipcMain.handle('scheduler:deletePlaybook', (_e, id: string) => deletePlaybook(openGlobalDb(), id));

  // Instantiate job(s) from a playbook and queue the first (arming it when scheduled/recurring).
  ipcMain.handle('scheduler:runPlaybook', (_e, id: string, opts: {
    name?: string; instructions?: string; workingDir?: string | null;
    scheduledFor?: number | null; scheduleCron?: string | null;
  } = {}) => {
    const db = openGlobalDb();
    const pb = getPlaybook(db, id);
    if (!pb) return null;
    // A step-less playbook is a single-step chain of its own prompt (caller overrides honored).
    const steps: PlaybookStep[] = pb.steps?.length ? pb.steps : [{
      name: opts.name?.trim() || pb.name,
      prompt: opts.instructions?.trim() || pb.prompt || '',
      skill: null, model: null, outputType: null,
    }];
    if (opts.scheduleCron != null && steps.length > 1) {
      throw new Error('recurring runs are not supported for multi-step playbooks');
    }
    let scheduledFor = opts.scheduledFor ?? null;
    if (opts.scheduleCron) {
      const next = nextOccurrence(opts.scheduleCron, Date.now());
      if (next == null) throw new Error(`Invalid recurrence spec: ${opts.scheduleCron}`);
      if (scheduledFor == null) scheduledFor = next;
    }
    const chainId = steps.length > 1 ? randomUUID() : null;
    const createChain = db.transaction((): ScheduledJob[] => {
      const created: ScheduledJob[] = [];
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        const j = createJob(db, {
          name: chainId ? `${pb.name} — ${s.name}` : s.name,
          instructions: s.prompt,
          playbookId: pb.id,
          outputType: s.outputType ?? pb.outputType,
          dodCondition: pb.dodCondition, maxTurns: pb.maxTurns,
          skill: s.skill ?? pb.skill, model: s.model ?? pb.model,
          allowedTools: pb.allowedTools, permissionMode: pb.permissionMode,
          workingDir: opts.workingDir ?? null,
          // Only step 0 carries the fire time; successors follow on completion.
          scheduledFor: i === 0 ? scheduledFor : null,
          scheduleCron: i === 0 ? (opts.scheduleCron ?? null) : null,
          chainId, chainStep: chainId ? i : null,
          prevTaskId: i > 0 ? created[i - 1].id : null,
        });
        created.push(updateJob(db, j.id, { status: i === 0 ? 'queue' : 'blocked' }));
      }
      return created;
    });
    return createChain()[0];
  });
}
