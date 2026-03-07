import { ipcMain } from 'electron';
import simpleGit from 'simple-git';
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

export interface FileChange {
  path: string;
  insertions: number;
  deletions: number;
  status: 'new' | 'modified' | 'deleted' | 'renamed';
}

export function registerGitHandlers(): void {
  ipcMain.handle('git:diff', async (_event, projectId: string) => {
    const projectPath = getProjectPath(projectId);
    const git = simpleGit(projectPath);
    // Get diff of all uncommitted changes (staged + unstaged)
    const diff = await git.diff();
    const stagedDiff = await git.diff(['--cached']);
    // Also include untracked files as diffs
    const status = await git.status();
    let untrackedDiff = '';
    for (const file of status.not_added) {
      try {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const content = fs.readFileSync(path.resolve(projectPath, file), 'utf-8');
        untrackedDiff += `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${content.split('\n').length} @@\n${content.split('\n').map(l => `+${l}`).join('\n')}\n`;
      } catch {
        // skip files we can't read
      }
    }
    return (stagedDiff || diff || '') + untrackedDiff;
  });

  ipcMain.handle('git:commit', async (_event, projectId: string, message: string) => {
    const projectPath = getProjectPath(projectId);
    const git = simpleGit(projectPath);
    await git.add('.');
    const result = await git.commit(message);
    return { hash: result.commit, summary: result.summary };
  });

  ipcMain.handle('git:log', async (_event, projectId: string, count = 20) => {
    const projectPath = getProjectPath(projectId);
    const git = simpleGit(projectPath);
    try {
      const log = await git.log({ maxCount: count });
      return log.all.map(entry => ({
        hash: entry.hash,
        message: entry.message,
        date: entry.date,
        author: entry.author_name,
      }));
    } catch {
      return [];
    }
  });

  ipcMain.handle('git:status', async (_event, projectId: string) => {
    const projectPath = getProjectPath(projectId);
    const git = simpleGit(projectPath);
    const status = await git.status();
    const files: FileChange[] = [
      ...status.modified.map(f => ({ path: f, insertions: 0, deletions: 0, status: 'modified' as const })),
      ...status.not_added.map(f => ({ path: f, insertions: 0, deletions: 0, status: 'new' as const })),
      ...status.created.map(f => ({ path: f, insertions: 0, deletions: 0, status: 'new' as const })),
      ...status.deleted.map(f => ({ path: f, insertions: 0, deletions: 0, status: 'deleted' as const })),
      ...status.renamed.map(f => ({ path: f.to || f.from, insertions: 0, deletions: 0, status: 'renamed' as const })),
    ];
    // Deduplicate by path
    const unique = [...new Map(files.map(f => [f.path, f])).values()];
    return { clean: status.isClean(), files: unique };
  });

  ipcMain.handle('git:branch', async (_event, projectId: string) => {
    const projectPath = getProjectPath(projectId);
    const git = simpleGit(projectPath);
    const branchSummary = await git.branch();
    return {
      current: branchSummary.current,
      branches: branchSummary.all.filter(b => !b.startsWith('remotes/')),
    };
  });

  ipcMain.handle('git:discardAll', async (_event, projectId: string) => {
    const projectPath = getProjectPath(projectId);
    const git = simpleGit(projectPath);
    // Discard all changes: reset staged, checkout tracked, clean untracked
    await git.reset(['HEAD']);
    await git.checkout(['--', '.']);
    await git.clean('f', ['-d']);
    return { status: 'ok' };
  });
}
