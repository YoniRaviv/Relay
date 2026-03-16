import { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { stageAndCommit, pushToRemote, getProjectPath } from '../git/commitHelper';
import { openDb } from '../db/connection';

export async function autoCommitTask(
    projectId: string,
    taskId: string,
    commitMessage: string,
    win: BrowserWindow,
): Promise<{ hash: string | false }> {
    const projectPath = getProjectPath(projectId);

    // Stage all and commit
    const commitHash = await stageAndCommit(projectPath, commitMessage);

    // Push
    let pushWarning: string | null = null;
    if (commitHash) {
        pushWarning = await pushToRemote(projectPath);
    }

    // Update task status to done with commit hash — mark as auto-approved
    const db = openDb(projectPath);
    db.prepare('UPDATE tasks SET status = ?, commit_hash = ?, approved_by = ?, updated_at = ? WHERE id = ?')
        .run('done', commitHash, 'auto', new Date().toISOString(), taskId);

    // Notify UI
    try {
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
            win.webContents.send('agent:activity', {
                id: randomUUID(),
                taskId,
                type: pushWarning ? 'warning' : 'text',
                content: commitHash
                    ? pushWarning
                        ? `Committed locally: ${commitHash.slice(0, 7)} — ${pushWarning}`
                        : `Auto-committed: ${commitHash.slice(0, 7)}`
                    : 'Done (no file changes)',
                timestamp: new Date().toISOString(),
            });
        }
    } catch { /* window destroyed */ }

    return { hash: commitHash || false };
}
