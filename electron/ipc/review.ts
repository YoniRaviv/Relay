import { ipcMain, BrowserWindow } from 'electron';
import simpleGit from 'simple-git';
import { randomUUID } from 'node:crypto';
import { store } from './settings';
import { openDb } from '../db/connection';

function getProjectPath(projectId: string): string {
  const projects = store.get('recentProjects', []) as Array<{ path: string }>;
  for (const p of projects) {
    try {
      const db = openDb(p.path);
      const row = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
      if (row) return p.path;
    } catch {
      continue;
    }
  }
  throw new Error('Project not found');
}

export function registerReviewHandlers(): void {
  ipcMain.handle('review:getDiff', async (_event, projectId: string) => {
    const projectPath = getProjectPath(projectId);
    const git = simpleGit(projectPath);
    const diff = await git.diff();
    const stagedDiff = await git.diff(['--cached']);
    const status = await git.status();

    // Include untracked files
    let untrackedDiff = '';
    for (const file of status.not_added) {
      try {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const content = fs.readFileSync(path.resolve(projectPath, file), 'utf-8');
        const lines = content.split('\n');
        untrackedDiff += `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${lines.map(l => `+${l}`).join('\n')}\n`;
      } catch {
        // skip
      }
    }

    return (stagedDiff || diff || '') + untrackedDiff;
  });

  ipcMain.handle('review:approve', async (_event, projectId: string, taskId: string, commitMessage: string) => {
    const projectPath = getProjectPath(projectId);
    const git = simpleGit(projectPath);
    const db = openDb(projectPath);

    // Stage all and commit
    await git.add('.');
    const result = await git.commit(commitMessage);

    // Push to remote
    try {
      const branchSummary = await git.branch();
      await git.push('origin', branchSummary.current, ['--set-upstream']);
    } catch {
      // Push may fail if no remote configured — continue anyway
    }

    // Update task status to approved with commit hash
    const commitHash = result.commit || null;
    db.prepare('UPDATE tasks SET status = ?, commit_hash = ?, updated_at = ? WHERE id = ?')
      .run('approved', commitHash, new Date().toISOString(), taskId);

    // Notify UI
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      win.webContents.send('agent:activity', {
        id: randomUUID(),
        taskId,
        type: 'text',
        content: `Approved and committed: ${result.commit || 'done'}`,
        timestamp: new Date().toISOString(),
      });

      // Refresh tasks in UI
      const allTasks = db.prepare(
        `SELECT * FROM tasks WHERE project_id = ? ORDER BY "order" ASC`
      ).all(projectId) as Record<string, unknown>[];
      win.webContents.send('loop:tasksUpdated', allTasks.map(rowToTask));
    }

    return { hash: result.commit, summary: result.summary };
  });

  ipcMain.handle('review:reject', async (_event, projectId: string, taskId: string, notes: string) => {
    const projectPath = getProjectPath(projectId);
    const git = simpleGit(projectPath);
    const db = openDb(projectPath);

    // Discard all changes
    await git.reset(['HEAD']);
    await git.checkout(['--', '.']);
    await git.clean('f', ['-d']);

    // Update task: back to pending, increment passes, store rejection notes
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Record<string, unknown> | undefined;
    const currentPasses = task ? (task.passes as number) : 0;
    const existingNotes = task?.rejection_notes as string | null;
    const combinedNotes = existingNotes
      ? `${existingNotes}\n\n--- Attempt ${currentPasses + 1} ---\n${notes}`
      : `--- Attempt ${currentPasses + 1} ---\n${notes}`;

    db.prepare('UPDATE tasks SET status = ?, passes = ?, rejection_notes = ?, updated_at = ? WHERE id = ?')
      .run('pending', currentPasses + 1, combinedNotes, new Date().toISOString(), taskId);

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

      const allTasks = db.prepare(
        `SELECT * FROM tasks WHERE project_id = ? ORDER BY "order" ASC`
      ).all(projectId) as Record<string, unknown>[];
      win.webContents.send('loop:tasksUpdated', allTasks.map(rowToTask));
    }

    return { status: 'ok' };
  });
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
