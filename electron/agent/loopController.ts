import { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { getEngine } from './engines';
import { openDb } from '../db/connection';
import { store } from '../ipc/settings';
import type { Task } from '../../shared/types';

let loopState: 'idle' | 'running' | 'paused' | 'stopped' = 'idle';
let abortSignal = { aborted: false };

function getDbForProject(projectId: string) {
  const projects = store.get('recentProjects', []) as Array<{ path: string }>;
  for (const p of projects) {
    try {
      const db = openDb(p.path);
      const row = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
      if (row) return db;
    } catch {
      continue;
    }
  }
  throw new Error('Project not found');
}

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    prdId: row.prd_id as string,
    storyId: row.story_id as string,
    title: row.title as string,
    description: row.description as string,
    acceptanceCriteria: row.acceptance_criteria as string,
    priority: row.priority as Task['priority'],
    status: row.status as Task['status'],
    order: row.order as number,
    passes: row.passes as number,
    rejectionNotes: row.rejection_notes as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function getNextPendingTask(projectId: string, prdId?: string): Task | null {
  const db = getDbForProject(projectId);
  if (prdId) {
    const row = db.prepare(
      `SELECT * FROM tasks WHERE project_id = ? AND prd_id = ? AND status = 'pending' ORDER BY "order" ASC LIMIT 1`
    ).get(projectId, prdId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return rowToTask(row);
  }
  const row = db.prepare(
    `SELECT * FROM tasks WHERE project_id = ? AND status = 'pending' ORDER BY "order" ASC LIMIT 1`
  ).get(projectId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToTask(row);
}

export function getLoopState(): typeof loopState {
  return loopState;
}

export async function startLoop(projectId: string, win: BrowserWindow, prdId?: string): Promise<void> {
  if (loopState === 'running') return;

  loopState = 'running';
  abortSignal = { aborted: false };
  win.webContents.send('loop:stateChange', { state: 'running' });

  try {
    while (loopState as string === 'running') {
      const task = getNextPendingTask(projectId, prdId);
      if (!task) {
        win.webContents.send('agent:activity', {
          id: randomUUID(),
          taskId: null,
          type: 'text',
          content: 'All tasks complete. Loop finished.',
          timestamp: new Date().toISOString(),
        });
        break;
      }

      // Notify UI of current task
      win.webContents.send('loop:taskChange', { taskId: task.id });

      await getEngine().runTask(task, win, abortSignal);

      // Refresh task list in UI
      const db = getDbForProject(projectId);
      const allTasks = prdId
        ? db.prepare(`SELECT * FROM tasks WHERE project_id = ? AND prd_id = ? ORDER BY "order" ASC`).all(projectId, prdId) as Record<string, unknown>[]
        : db.prepare(`SELECT * FROM tasks WHERE project_id = ? ORDER BY "order" ASC`).all(projectId) as Record<string, unknown>[];
      win.webContents.send('loop:tasksUpdated', allTasks.map(rowToTask));

      // Check if the task is now in review — auto-pause for human review
      const updatedTask = db.prepare('SELECT status FROM tasks WHERE id = ?').get(task.id) as Record<string, unknown> | undefined;
      if (updatedTask && updatedTask.status === 'review') {
        loopState = 'paused';
        win.webContents.send('loop:stateChange', { state: 'paused' });
        win.webContents.send('agent:activity', {
          id: randomUUID(),
          taskId: task.id,
          type: 'text',
          content: 'Paused: waiting for human review before continuing.',
          timestamp: new Date().toISOString(),
        });
        // Wait for resume or stop
        await new Promise<void>((resolve) => {
          const check = setInterval(() => {
            if (loopState !== 'paused') {
              clearInterval(check);
              resolve();
            }
          }, 200);
        });
        if (loopState as string === 'stopped') break;
      }

      // Check if paused (manual pause)
      if (loopState as string === 'paused') {
        win.webContents.send('loop:stateChange', { state: 'paused' });
        // Wait for resume or stop
        await new Promise<void>((resolve) => {
          const check = setInterval(() => {
            if (loopState !== 'paused') {
              clearInterval(check);
              resolve();
            }
          }, 200);
        });
      }

      if (loopState as string === 'stopped') break;
    }
  } finally {
    loopState = 'idle';
    win.webContents.send('loop:stateChange', { state: 'idle' });
    win.webContents.send('loop:taskChange', { taskId: null });
  }
}

export function pauseLoop(): void {
  if (loopState === 'running') {
    loopState = 'paused';
  }
}

export function resumeLoop(): void {
  if (loopState === 'paused') {
    loopState = 'running';
  }
}

export function stopLoop(): void {
  abortSignal.aborted = true;
  loopState = 'stopped';
}
