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
    win.webContents.send('agent:activity', {
        id: randomUUID(),
        taskId,
        type: 'text',
        content: commitHash ? `Auto-committed: ${commitHash}` : 'Done (no file changes)',
        timestamp: new Date().toISOString(),
    });

    return { hash: commitHash || false };
}
