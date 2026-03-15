import { ipcMain, BrowserWindow } from 'electron';
import simpleGit from 'simple-git';
import { randomUUID } from 'node:crypto';
import { store } from './settings';
import { openDb } from '../db/connection';
import { withGitLock } from '../git/lock';
import { withSentry } from './withSentry';

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
    return withGitLock(async () => {
      const projectPath = getProjectPath(projectId);
      const git = simpleGit(projectPath);
      const diff = await git.diff(['--', '.', ':!.relay/']);
      const stagedDiff = await git.diff(['--cached', '--', '.', ':!.relay/']);
      const status = await git.status();

      // Include untracked files (exclude .relay/)
      let untrackedDiff = '';
      for (const file of status.not_added.filter(f => !f.startsWith('.relay/') && !f.startsWith('.relay\\'))) {
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
  });

  ipcMain.handle('review:approve', withSentry('review:approve', async (_event, projectId: string, taskId: string, commitMessage: string) => {
    return withGitLock(async () => {
      const projectPath = getProjectPath(projectId);
      const git = simpleGit(projectPath);
      const db = openDb(projectPath);

      // Stage all and commit
      await git.add('.');
      let commitHash: string | null = null;
      try {
        const result = await git.commit(commitMessage);
        commitHash = result.commit || null;
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (!msg.includes('nothing to commit') && !msg.includes('no changes added')) {
          throw err; // Re-throw real errors
        }
        // Nothing to commit is OK — task still done
      }

      // Push if we have a commit
      if (commitHash) {
        try {
          const branchSummary = await git.branch();
          await git.push('origin', branchSummary.current, ['--set-upstream']);
        } catch {
          // Push may fail if no remote configured — continue anyway
        }
      }

      // Update task status to done with commit hash
      db.prepare('UPDATE tasks SET status = ?, commit_hash = ?, updated_at = ? WHERE id = ?')
        .run('done', commitHash, new Date().toISOString(), taskId);

    // Notify UI
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      win.webContents.send('agent:activity', {
        id: randomUUID(),
        taskId,
        type: 'text',
        content: commitHash ? `Done — committed: ${commitHash}` : 'Done (no file changes)',
        timestamp: new Date().toISOString(),
      });

      // Refresh tasks in UI — filter by prd_id to avoid cross-feature leakage
      const taskRow = db.prepare('SELECT prd_id FROM tasks WHERE id = ?').get(taskId) as Record<string, unknown> | undefined;
      const prdId = taskRow?.prd_id as string | undefined;
      const query = prdId
        ? `SELECT * FROM tasks WHERE project_id = ? AND prd_id = ? ORDER BY "order" ASC`
        : `SELECT * FROM tasks WHERE project_id = ? ORDER BY "order" ASC`;
      const params = prdId ? [projectId, prdId] : [projectId];
      const allTasks = db.prepare(query).all(...params) as Record<string, unknown>[];
      win.webContents.send('loop:tasksUpdated', allTasks.map(rowToTask));
    }

      return { hash: commitHash, summary: commitHash ? 'committed' : 'no changes' };
    });
  }));

  ipcMain.handle('review:reject', withSentry('review:reject', async (_event, projectId: string, taskId: string, notes: string) => {
    return withGitLock(async () => {
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

        // Refresh tasks in UI — filter by prd_id to avoid cross-feature leakage
        const taskRow = db.prepare('SELECT prd_id FROM tasks WHERE id = ?').get(taskId) as Record<string, unknown> | undefined;
        const prdId = taskRow?.prd_id as string | undefined;
        const query = prdId
          ? `SELECT * FROM tasks WHERE project_id = ? AND prd_id = ? ORDER BY "order" ASC`
          : `SELECT * FROM tasks WHERE project_id = ? ORDER BY "order" ASC`;
        const params = prdId ? [projectId, prdId] : [projectId];
        const allTasks = db.prepare(query).all(...params) as Record<string, unknown>[];
        win.webContents.send('loop:tasksUpdated', allTasks.map(rowToTask));
      }

      return { status: 'ok' };
    });
  }));
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
