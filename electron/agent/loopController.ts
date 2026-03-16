import { BrowserWindow, Notification } from 'electron';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import * as Sentry from '@sentry/electron/main';
import { getEngine } from './engines';
import { openDb } from '../db/connection';
import { store } from '../ipc/settings';
import { autoCommitTask } from './autoCommit';
import { createWipCommit, getProjectPath as getProjectPathFromHelper } from '../git/commitHelper';
import { cleanStaleLockFile } from '../git/lock';
import type { Task, BuildMode } from '../../shared/types';

/** Safe wrapper for webContents.send — silently drops messages if window is destroyed */
function safeSend(win: BrowserWindow, channel: string, ...args: unknown[]): void {
  try {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  } catch {
    // Suppress EPIPE / write-after-destroy errors
  }
}

function sendNotification(title: string, body: string): void {
  if (store.get('notificationsEnabled', true) && Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

let loopState: 'idle' | 'running' | 'paused' | 'stopped' = 'idle';
let abortSignal = { aborted: false };
const loopEvents = new EventEmitter();

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
  safeSend(win, 'loop:tasksUpdated', rows.map(rowToTask));
}

export function getLoopState(): typeof loopState {
  return loopState;
}

/**
 * Wait for the loop to leave the paused state (resume or stop).
 * @param skipEmit - If true, skip emitting the paused state (already emitted by caller)
 */
async function waitForUnpause(win: BrowserWindow, skipEmit = false): Promise<void> {
  if (!skipEmit) {
    safeSend(win,'loop:stateChange', { state: 'paused' });
  }
  if (loopState !== 'paused') return; // Already unpaused
  await new Promise<void>((resolve) => {
    loopEvents.once('stateChange', resolve);
  });
}

export async function startLoop(projectId: string, win: BrowserWindow, prdId?: string, buildMode?: BuildMode): Promise<void> {
  const effectiveBuildMode: BuildMode = buildMode ?? (store.get('buildMode') as BuildMode | undefined) ?? 'review';
  if (loopState === 'running') return;

  loopState = 'running';
  abortSignal = { aborted: false };
  safeSend(win,'loop:stateChange', { state: 'running' });

  // Clean up any stale git lock files from previous crashed sessions
  try {
    const projectPath = getProjectPathFromHelper(projectId);
    cleanStaleLockFile(projectPath);
  } catch { /* non-critical */ }

  try {
    while (loopState as string === 'running') {
      const task = getNextPendingTask(projectId, prdId);
      if (!task) {
        safeSend(win,'agent:activity', {
          id: randomUUID(),
          taskId: null,
          type: 'text',
          content: 'All tasks complete. Loop finished.',
          timestamp: new Date().toISOString(),
        });
        safeSend(win,'loop:allTasksComplete', { projectId });
        sendNotification('Build Complete', 'All tasks have been completed.');
        break;
      }

      // Notify UI of current task
      safeSend(win,'loop:taskChange', { taskId: task.id });

      const result = await getEngine().runTask(task, win, abortSignal);

      // ── Handle pause/stop that interrupted the task ──
      if (abortSignal.aborted) {
        const db = getDbForProject(projectId);
        // Check current task status — engine may have already moved it to 'review' or 'done'
        const currentStatus = (db.prepare('SELECT status FROM tasks WHERE id = ?').get(task.id) as { status: string } | undefined)?.status;
        const canReset = currentStatus === 'in_progress' || currentStatus === 'failed';

        if (loopState as string === 'paused') {
          safeSend(win,'agent:activity', {
            id: randomUUID(),
            taskId: task.id,
            type: 'text',
            content: 'Task paused.',
            timestamp: new Date().toISOString(),
          });
          refreshAndBroadcastTasks(projectId, prdId, win);
          await waitForUnpause(win, true); // skipEmit: pauseLoop already emitted
          // After unpause: only reset to pending if engine didn't already complete the task
          if (canReset) {
            db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
              .run('pending', new Date().toISOString(), task.id);
          }
          refreshAndBroadcastTasks(projectId, prdId, win);
          if (loopState as string === 'stopped') break;
          // Reset abort signal for the next task
          abortSignal = { aborted: false };
          continue;
        }
        // Stopped — only reset if task wasn't already completed by engine
        if (canReset) {
          db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
            .run('pending', new Date().toISOString(), task.id);
        }
        refreshAndBroadcastTasks(projectId, prdId, win);
        break;
      }

      // ── Handle task failure (engine returned success: false) ──
      if (!result.success) {
        const db = getDbForProject(projectId);
        // Re-read current passes from DB (engine may have incremented)
        const currentRow = db.prepare('SELECT passes FROM tasks WHERE id = ?').get(task.id) as { passes: number } | undefined;
        const currentPasses = (currentRow?.passes ?? task.passes) + 1;
        const rawMaxPasses = store.get('maxPassesPerTask', 5) as number;
        // Treat 0 or negative as "no retries" (fail immediately), not "infinite"
        const maxPasses = rawMaxPasses <= 0 ? 1 : rawMaxPasses;

        const errorMsg = result.error || 'Unknown error';

        if (currentPasses >= maxPasses) {
          // Exceeded max attempts — mark as permanently failed
          db.prepare('UPDATE tasks SET status = ?, passes = ?, rejection_notes = ?, updated_at = ? WHERE id = ?')
            .run('failed', currentPasses, `Failed after ${currentPasses} attempts. Last error: ${errorMsg}`, new Date().toISOString(), task.id);
          Sentry.captureMessage(`Task exceeded max attempts`, {
            level: 'warning',
            tags: { taskId: task.id, projectId },
            extra: { passes: currentPasses, lastError: errorMsg },
          });
          safeSend(win,'agent:activity', {
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
          safeSend(win,'agent:activity', {
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

        // Brief delay before retry to prevent cascade bombing when git is locked or CC crashes
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      // ── Task succeeded — create WIP commit to isolate this task's changes ──
      const db = getDbForProject(projectId);
      const updatedTask = db.prepare('SELECT status, story_id, title FROM tasks WHERE id = ?').get(task.id) as Record<string, unknown> | undefined;

      if (updatedTask && updatedTask.status === 'review') {
        // Create a WIP commit for this task — isolates its changes from the next task
        let wipHash: string | null = null;
        try {
          wipHash = await createWipCommit(
            projectId, task.id,
            updatedTask.story_id as string,
            updatedTask.title as string,
          );
        } catch (err) {
          console.warn('[loopController] WIP commit failed:', err);
        }

        if (!wipHash) {
          // No file changes — auto-mark done
          db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
            .run('done', new Date().toISOString(), task.id);
          safeSend(win, 'agent:activity', {
            id: randomUUID(),
            taskId: task.id,
            type: 'text',
            content: 'No file changes detected — marked done.',
            timestamp: new Date().toISOString(),
          });
          refreshAndBroadcastTasks(projectId, prdId, win);
          continue;
        }

        safeSend(win, 'agent:activity', {
          id: randomUUID(),
          taskId: task.id,
          type: 'text',
          content: `Changes saved as WIP commit: ${wipHash.slice(0, 7)}`,
          timestamp: new Date().toISOString(),
        });
        refreshAndBroadcastTasks(projectId, prdId, win);

        if (effectiveBuildMode === 'auto-pilot' || effectiveBuildMode === ('auto-commit' as string)) {
          // Auto-commit and mark as done, then continue
          const commitPrefix = (store.get('commitPrefix') ?? 'feat') as string;
          const commitMsg = `${commitPrefix}(${updatedTask.story_id}): ${updatedTask.title}`;
          await autoCommitTask(projectId, task.id, commitMsg, win);
          refreshAndBroadcastTasks(projectId, prdId, win);
        } else if (effectiveBuildMode === 'continuous') {
          // Continuous: skip the pause, leave task in review status, continue to next
          safeSend(win,'agent:activity', {
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
          safeSend(win,'agent:activity', {
            id: randomUUID(),
            taskId: task.id,
            type: 'text',
            content: 'Paused: waiting for human review before continuing.',
            timestamp: new Date().toISOString(),
          });
          await waitForUnpause(win);
          if (loopState as string === 'stopped') break;
        }
      } else {
        refreshAndBroadcastTasks(projectId, prdId, win);
      }

      // Check if paused (manual pause between tasks)
      if (loopState as string === 'paused') {
        await waitForUnpause(win);
      }

      if (loopState as string === 'stopped') break;
    }
  } catch (error) {
    Sentry.captureException(error, {
      tags: { component: 'agentLoop', projectId },
    });
    throw error;
  } finally {
    loopState = 'idle';
    abortSignal = { aborted: false };
    safeSend(win,'loop:stateChange', { state: 'idle' });
    safeSend(win,'loop:taskChange', { taskId: null });
  }
}

export function pauseLoop(win?: BrowserWindow): void {
  if (loopState === 'running') {
    loopState = 'paused';
    abortSignal.aborted = true;
    if (win) safeSend(win,'loop:stateChange', { state: 'paused' });
  }
}

export function resumeLoop(win?: BrowserWindow): void {
  if (loopState === 'paused') {
    loopState = 'running';
    loopEvents.emit('stateChange');
    if (win) safeSend(win,'loop:stateChange', { state: 'running' });
  }
}

export function stopLoop(win?: BrowserWindow): void {
  abortSignal.aborted = true;
  loopState = 'stopped';
  loopEvents.emit('stateChange');
  if (win) safeSend(win,'loop:stateChange', { state: 'stopped' });
}
