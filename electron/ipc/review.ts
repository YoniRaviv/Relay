import { ipcMain, BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { openDb } from '../db/connection';
import { withGitLock } from '../git/lock';
import { withSentry } from './withSentry';
import { getTaskDiff, approveTask, rejectTask, getProjectPath } from '../git/commitHelper';

export function registerReviewHandlers(): void {
  // #39: Unified diff filter — always excludes .relay/, uses task-scoped diff when available
  ipcMain.handle('review:getDiff', async (_event, projectId: string, taskId?: string) => {
    return withGitLock(async () => {
      if (taskId) {
        // Task-scoped diff: shows only this task's WIP commit changes
        return getTaskDiff(projectId, taskId);
      }
      // Fallback: full working tree diff (for manual git:diff calls)
      return getTaskDiff(projectId, '');
    });
  });

  // #6/#8/#26: Approve only this task's commit, re-verify before committing
  ipcMain.handle('review:approve', withSentry('review:approve', async (_event, projectId: string, taskId: string, commitMessage: string) => {
    return withGitLock(async () => {
      const { hash, pushWarning } = await approveTask(projectId, taskId, commitMessage);

      // Notify UI
      const win = BrowserWindow.getFocusedWindow();
      if (win) {
        win.webContents.send('agent:activity', {
          id: randomUUID(),
          taskId,
          type: pushWarning ? 'warning' : 'text',
          content: hash
            ? pushWarning
              ? `Committed locally: ${hash.slice(0, 7)} — ${pushWarning}`
              : `Done — committed: ${hash.slice(0, 7)}`
            : 'Done (no file changes)',
          timestamp: new Date().toISOString(),
        });

        broadcastTasks(projectId, taskId, win);
      }

      return { hash, summary: hash ? 'committed' : 'no changes' };
    });
  }));

  // #6/#7: Reject only reverts this task's WIP commit, not all changes
  ipcMain.handle('review:reject', withSentry('review:reject', async (_event, projectId: string, taskId: string, notes: string) => {
    return withGitLock(async () => {
      await rejectTask(projectId, taskId, notes);

      // Notify UI
      const win = BrowserWindow.getFocusedWindow();
      if (win) {
        win.webContents.send('agent:activity', {
          id: randomUUID(),
          taskId,
          type: 'text',
          content: `Rejected. Task returned to pending with feedback.`,
          timestamp: new Date().toISOString(),
        });

        broadcastTasks(projectId, taskId, win);
      }

      return { status: 'ok' };
    });
  }));
}

/** Refresh task list in UI, scoped to the task's PRD */
function broadcastTasks(projectId: string, taskId: string, win: BrowserWindow): void {
  try {
    const projectPath = getProjectPath(projectId);
    const db = openDb(projectPath);
    const taskRow = db.prepare('SELECT prd_id FROM tasks WHERE id = ?').get(taskId) as Record<string, unknown> | undefined;
    const prdId = taskRow?.prd_id as string | undefined;
    const query = prdId
      ? `SELECT * FROM tasks WHERE project_id = ? AND prd_id = ? ORDER BY "order" ASC`
      : `SELECT * FROM tasks WHERE project_id = ? ORDER BY "order" ASC`;
    const params = prdId ? [projectId, prdId] : [projectId];
    const allTasks = db.prepare(query).all(...params) as Record<string, unknown>[];
    win.webContents.send('loop:tasksUpdated', allTasks.map(rowToTask));
  } catch {
    // best effort
  }
}

function rowToTask(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    prdId: row.prd_id as string,
    storyId: row.story_id as string,
    title: row.title as string,
    description: row.description as string,
    acceptanceCriteria: row.acceptance_criteria as string,
    priority: row.priority as string,
    status: row.status as string,
    order: row.order as number,
    passes: row.passes as number,
    rejectionNotes: row.rejection_notes as string | null,
    commitHash: (row.commit_hash as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
