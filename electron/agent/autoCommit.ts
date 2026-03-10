import simpleGit from 'simple-git';
import { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { openDb } from '../db/connection';
import { store } from '../ipc/settings';

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

export async function autoCommitTask(
    projectId: string,
    taskId: string,
    commitMessage: string,
    win: BrowserWindow,
): Promise<{ hash: string | false }> {
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
    win.webContents.send('agent:activity', {
        id: randomUUID(),
        taskId,
        type: 'text',
        content: `Auto-committed: ${result.commit || 'done'}`,
        timestamp: new Date().toISOString(),
    });

    return { hash: result.commit };
}
