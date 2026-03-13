import { BrowserWindow, Notification } from 'electron';
import { randomUUID } from 'node:crypto';
import { getEngine } from './engines';
import { openDb } from '../db/connection';
import { store } from '../ipc/settings';
import { autoCommitTask } from './autoCommit';
import type { Task, BuildMode } from '../../shared/types';

function sendNotification(title: string, body: string): void {
  if (store.get('notificationsEnabled', true) && Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

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
    commitHash: (row.commit_hash as string | null) ?? null,
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

function refreshAndBroadcastTasks(projectId: string, prdId: string | undefined, win: BrowserWindow): void {
  const db = getDbForProject(projectId);
  const rows = prdId
    ? db.prepare(`SELECT * FROM tasks WHERE project_id = ? AND prd_id = ? ORDER BY "order" ASC`).all(projectId, prdId) as Record<string, unknown>[]
    : db.prepare(`SELECT * FROM tasks WHERE project_id = ? ORDER BY "order" ASC`).all(projectId) as Record<string, unknown>[];
  win.webContents.send('loop:tasksUpdated', rows.map(rowToTask));
}

export function getLoopState(): typeof loopState {
  return loopState;
}

/**
 * Wait for the loop to leave the paused state (resume or stop).
 */
async function waitForUnpause(win: BrowserWindow): Promise<void> {
  win.webContents.send('loop:stateChange', { state: 'paused' });
  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      if (loopState !== 'paused') {
        clearInterval(check);
        resolve();
      }
    }, 200);
  });
}

export async function startLoop(projectId: string, win: BrowserWindow, prdId?: string, buildMode?: BuildMode): Promise<void> {
  const effectiveBuildMode: BuildMode = buildMode ?? (store.get('buildMode') as BuildMode | undefined) ?? 'review';
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
        win.webContents.send('loop:allTasksComplete', { projectId });
        sendNotification('Build Complete', 'All tasks have been completed.');
        break;
      }

      // Notify UI of current task
      win.webContents.send('loop:taskChange', { taskId: task.id });

      const result = await getEngine().runTask(task, win, abortSignal);

      // ── Handle pause/stop that interrupted the task ──
      if (abortSignal.aborted) {
        const db = getDbForProject(projectId);
        if (loopState as string === 'paused') {
          // Pause interrupted the task — reset it to pending so it can be retried
          db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
            .run('pending', new Date().toISOString(), task.id);
          win.webContents.send('agent:activity', {
            id: randomUUID(),
            taskId: task.id,
            type: 'text',
            content: 'Task paused and returned to pending.',
            timestamp: new Date().toISOString(),
          });
          refreshAndBroadcastTasks(projectId, prdId, win);
          await waitForUnpause(win);
          if (loopState as string === 'stopped') break;
          // Reset abort signal for the next task
          abortSignal = { aborted: false };
          continue;
        }
        // Stopped — reset task to pending so it's not left in a broken state
        db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
          .run('pending', new Date().toISOString(), task.id);
        refreshAndBroadcastTasks(projectId, prdId, win);
        break;
      }

      // ── Handle task failure (engine returned success: false) ──
      if (!result.success) {
        const db = getDbForProject(projectId);
        // Re-read current passes from DB (engine may have incremented)
        const currentRow = db.prepare('SELECT passes FROM tasks WHERE id = ?').get(task.id) as { passes: number } | undefined;
        const currentPasses = (currentRow?.passes ?? task.passes) + 1;
        const maxPasses = store.get('maxPassesPerTask', 5) as number;

        const errorMsg = result.error || 'Unknown error';

        if (maxPasses > 0 && currentPasses >= maxPasses) {
          // Exceeded max attempts — mark as permanently failed
          db.prepare('UPDATE tasks SET status = ?, passes = ?, rejection_notes = ?, updated_at = ? WHERE id = ?')
            .run('failed', currentPasses, `Failed after ${currentPasses} attempts. Last error: ${errorMsg}`, new Date().toISOString(), task.id);
          win.webContents.send('agent:activity', {
            id: randomUUID(),
            taskId: task.id,
            type: 'error',
            content: `Task failed: exceeded max attempts (${maxPasses}). Error: ${errorMsg}`,
            timestamp: new Date().toISOString(),
          });
          sendNotification('Task Failed', `"${task.title}" exceeded ${maxPasses} attempts.`);
        } else {
          // Reset to pending for retry with incremented pass count and error context
          db.prepare('UPDATE tasks SET status = ?, passes = ?, rejection_notes = ?, updated_at = ? WHERE id = ?')
            .run('pending', currentPasses, `Attempt ${currentPasses} failed: ${errorMsg}`, new Date().toISOString(), task.id);
          win.webContents.send('agent:activity', {
            id: randomUUID(),
            taskId: task.id,
            type: 'error',
            content: `Task failed (attempt ${currentPasses}/${maxPasses > 0 ? maxPasses : '∞'}): ${errorMsg}. Will retry.`,
            timestamp: new Date().toISOString(),
          });
        }

        refreshAndBroadcastTasks(projectId, prdId, win);

        // Check for pause/stop before continuing
        if (loopState as string === 'paused') {
          await waitForUnpause(win);
          if (loopState as string === 'stopped') break;
        }
        if (loopState as string === 'stopped') break;
        continue;
      }

      // ── Task succeeded — refresh UI ──
      refreshAndBroadcastTasks(projectId, prdId, win);

      // Check if the task is now in review — behaviour depends on effectiveBuildMode
      const db = getDbForProject(projectId);
      const updatedTask = db.prepare('SELECT status, story_id, title FROM tasks WHERE id = ?').get(task.id) as Record<string, unknown> | undefined;
      if (updatedTask && updatedTask.status === 'review') {
        if (effectiveBuildMode === 'auto-commit') {
          // Auto-approve: commit and mark as approved, then continue
          const commitPrefix = (store.get('commitPrefix') ?? 'feat') as string;
          const commitMsg = `${commitPrefix}(${updatedTask.story_id}): ${updatedTask.title}`;
          await autoCommitTask(projectId, task.id, commitMsg, win);
          refreshAndBroadcastTasks(projectId, prdId, win);
        } else if (effectiveBuildMode === 'continuous') {
          // Continuous: skip the pause, leave task in review status, continue to next
          win.webContents.send('agent:activity', {
            id: randomUUID(),
            taskId: task.id,
            type: 'text',
            content: 'Task ready for review. Continuing to next task.',
            timestamp: new Date().toISOString(),
          });
        } else {
          // Review mode (default): pause and wait for human
          loopState = 'paused';
          sendNotification('Review Needed', `"${task.title}" is ready for your review.`);
          win.webContents.send('agent:activity', {
            id: randomUUID(),
            taskId: task.id,
            type: 'text',
            content: 'Paused: waiting for human review before continuing.',
            timestamp: new Date().toISOString(),
          });
          await waitForUnpause(win);
          if (loopState as string === 'stopped') break;
        }
      }

      // Check if paused (manual pause between tasks)
      if (loopState as string === 'paused') {
        await waitForUnpause(win);
      }

      if (loopState as string === 'stopped') break;
    }
  } finally {
    loopState = 'idle';
    abortSignal = { aborted: false };
    win.webContents.send('loop:stateChange', { state: 'idle' });
    win.webContents.send('loop:taskChange', { taskId: null });
  }
}

export function pauseLoop(): void {
  if (loopState === 'running') {
    loopState = 'paused';
    abortSignal.aborted = true;
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
