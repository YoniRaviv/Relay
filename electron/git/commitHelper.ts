import simpleGit from 'simple-git';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../db/connection';
import { getProjectPath } from '../db/projectLookup';

/** Ensure critical ignore patterns exist before any commit to prevent staging node_modules etc. */
function ensureMinimalGitignore(projectPath: string): void {
    const MUST_IGNORE = ['node_modules/', '.relay/', 'dist/', 'build/', '.env', '.env.*'];
    const gitignorePath = path.join(projectPath, '.gitignore');
    try {
        const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';
        const lines = new Set(existing.split('\n').map(l => l.trim()));
        const toAdd = MUST_IGNORE.filter(p => !lines.has(p));
        if (toAdd.length > 0) {
            const base = existing.endsWith('\n') || existing === '' ? existing : existing + '\n';
            fs.writeFileSync(gitignorePath, base + toAdd.join('\n') + '\n', 'utf-8');
        }
    } catch { /* best effort */ }
}

/**
 * Stage all changes (excluding .relay/) and commit.
 * Returns the commit hash or null if nothing to commit.
 */
export async function stageAndCommit(
    projectPath: string,
    message: string,
): Promise<string | null> {
    ensureMinimalGitignore(projectPath);
    const git = simpleGit(projectPath);
    await git.add('.');
    try {
        const result = await git.commit(message);
        return result.commit || null;
    } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('nothing to commit') || msg.includes('no changes added')) {
            return null;
        }
        throw err;
    }
}

/**
 * Push current branch to origin. Returns a warning string if push failed, null on success.
 */
export async function pushToRemote(projectPath: string): Promise<string | null> {
    const git = simpleGit(projectPath);
    try {
        const branchSummary = await git.branch();
        await git.push('origin', branchSummary.current, ['--set-upstream']);
        return null;
    } catch (pushErr) {
        const pushMsg = pushErr instanceof Error ? pushErr.message : String(pushErr);
        console.warn('[git:push] Push failed:', pushMsg);
        if (pushMsg.includes('remote') || pushMsg.includes('origin') || pushMsg.includes('does not appear')) {
            return 'Push failed — no remote configured. Commit saved locally.';
        }
        return `Push failed: ${pushMsg}. Commit saved locally.`;
    }
}

/**
 * Create a WIP (work-in-progress) commit for a task after the engine completes.
 * This isolates each task's changes into its own commit.
 * Returns the commit hash, or null if no changes to commit.
 */
export async function createWipCommit(
    projectId: string,
    taskId: string,
    storyId: string,
    title: string,
): Promise<string | null> {
    const projectPath = getProjectPath(projectId);
    const git = simpleGit(projectPath);

    const status = await git.status();
    if (status.isClean()) return null;

    const message = `wip(${storyId}): ${title} [relay:${taskId}]`;
    const hash = await stageAndCommit(projectPath, message);

    if (hash) {
        // Store the WIP commit hash on the task
        const db = openDb(projectPath);
        db.prepare('UPDATE tasks SET commit_hash = ?, updated_at = ? WHERE id = ?')
            .run(hash, new Date().toISOString(), taskId);
    }

    return hash;
}

/**
 * Get the diff for a specific task's WIP commit.
 * If the task has a commit_hash, shows that commit's diff.
 * Falls back to working tree diff (legacy behavior) if no commit hash.
 */
export async function getTaskDiff(projectId: string, taskId: string): Promise<string> {
    const projectPath = getProjectPath(projectId);
    const git = simpleGit(projectPath);
    const db = openDb(projectPath);

    const task = db.prepare('SELECT commit_hash FROM tasks WHERE id = ?').get(taskId) as { commit_hash: string | null } | undefined;

    if (task?.commit_hash) {
        // Show the diff of the specific WIP commit (task-scoped)
        try {
            return await git.diff([`${task.commit_hash}~1`, task.commit_hash, '--', '.', ':!.relay/']);
        } catch {
            // Commit might not exist (force-pushed, rebased). Fall back to show against parent.
            try {
                return await git.show([task.commit_hash, '--format=', '--', ':!.relay/']);
            } catch {
                // Last resort: fall through to working tree diff
            }
        }
    }

    // Fallback: working tree diff (legacy behavior for tasks without WIP commits)
    const diff = await git.diff(['--', '.', ':!.relay/']);
    const stagedDiff = await git.diff(['--cached', '--', '.', ':!.relay/']);
    const status = await git.status();

    let untrackedDiff = '';
    const fs = await import('node:fs');
    const path = await import('node:path');
    const MAX_UNTRACKED_FILES = 50;
    const MAX_FILE_SIZE = 100 * 1024;
    const untrackedFiles = status.not_added.filter(f => !f.startsWith('.relay/') && !f.startsWith('.relay\\'));
    let fileCount = 0;
    for (const file of untrackedFiles) {
        if (fileCount >= MAX_UNTRACKED_FILES) break;
        try {
            const absPath = path.resolve(projectPath, file);
            const stat = fs.statSync(absPath);
            if (stat.size > MAX_FILE_SIZE) {
                untrackedDiff += `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1 @@\n+(file too large to preview — ${Math.round(stat.size / 1024)}KB)\n`;
                fileCount++;
                continue;
            }
            const content = fs.readFileSync(absPath, 'utf-8');
            const lines = content.split('\n');
            untrackedDiff += `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${lines.map(l => `+${l}`).join('\n')}\n`;
            fileCount++;
        } catch {
            // skip
        }
    }

    return (stagedDiff || diff || '') + untrackedDiff;
}

/**
 * Approve a task: amend the WIP commit with a proper message, push, mark done.
 * If no WIP commit exists, falls back to staging + committing working tree.
 */
export async function approveTask(
    projectId: string,
    taskId: string,
    commitMessage: string,
): Promise<{ hash: string | null; pushWarning: string | null }> {
    const projectPath = getProjectPath(projectId);
    const git = simpleGit(projectPath);
    const db = openDb(projectPath);

    const task = db.prepare('SELECT commit_hash FROM tasks WHERE id = ?').get(taskId) as { commit_hash: string | null } | undefined;

    let commitHash: string | null = null;

    if (task?.commit_hash) {
        // WIP commit exists — amend it with the proper commit message
        try {
            const head = (await git.log(['-1'])).latest;
            if (head && head.hash.startsWith(task.commit_hash.slice(0, 7))) {
                // WIP commit is HEAD — safe to amend
                await git.raw(['commit', '--amend', '-m', commitMessage]);
                const newHead = (await git.log(['-1'])).latest;
                commitHash = newHead?.hash ?? task.commit_hash;
            } else {
                // WIP commit is not HEAD (other commits on top) — can't amend, just update message via note
                commitHash = task.commit_hash;
            }
        } catch {
            commitHash = task.commit_hash;
        }
    } else {
        // No WIP commit — legacy flow: stage and commit working tree
        commitHash = await stageAndCommit(projectPath, commitMessage);
    }

    // Push
    const pushWarning = await pushToRemote(projectPath);

    // Update task — mark as human-approved
    db.prepare('UPDATE tasks SET status = ?, commit_hash = ?, approved_by = ?, updated_at = ? WHERE id = ?')
        .run('done', commitHash, 'human', new Date().toISOString(), taskId);

    return { hash: commitHash, pushWarning };
}

/**
 * Reject a task: revert its WIP commit (if any), reset task to pending.
 * Only reverts that specific task's commit — other tasks' commits are preserved.
 */
export async function rejectTask(
    projectId: string,
    taskId: string,
    notes: string,
): Promise<void> {
    const projectPath = getProjectPath(projectId);
    const git = simpleGit(projectPath);
    const db = openDb(projectPath);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Record<string, unknown> | undefined;
    const commitHash = task?.commit_hash as string | null;
    const currentPasses = task ? (task.passes as number) : 0;
    const existingNotes = task?.rejection_notes as string | null;

    if (commitHash) {
        // Revert only this task's specific WIP commit
        try {
            const head = (await git.log(['-1'])).latest;
            if (head && head.hash.startsWith(commitHash.slice(0, 7))) {
                // WIP commit is HEAD — just reset it (cleaner than revert)
                await git.reset(['--soft', 'HEAD~1']);
                // Now unstage and discard the changes
                await git.reset(['HEAD']);
                await git.checkout(['--', '.']);
                await git.clean('f', ['-d']);
            } else {
                // WIP commit is buried under other commits — revert it
                await git.raw(['revert', '--no-edit', commitHash]);
            }
        } catch (err) {
            // Revert failed (conflicts, missing commit, etc.) — fall back to reset
            console.warn('[rejectTask] Revert failed, falling back to full reset:', err);
            await git.reset(['HEAD']);
            await git.checkout(['--', '.']);
            await git.clean('f', ['-d']);
        }
    } else {
        // No WIP commit — legacy: discard all working tree changes
        await git.reset(['HEAD']);
        await git.checkout(['--', '.']);
        await git.clean('f', ['-d']);
    }

    // Update task: back to pending, increment passes, store rejection notes
    const combinedNotes = existingNotes
        ? `${existingNotes}\n\n--- Attempt ${currentPasses + 1} ---\n${notes}`
        : `--- Attempt ${currentPasses + 1} ---\n${notes}`;

    db.prepare('UPDATE tasks SET status = ?, passes = ?, rejection_notes = ?, commit_hash = NULL, updated_at = ? WHERE id = ?')
        .run('pending', currentPasses + 1, combinedNotes, new Date().toISOString(), taskId);
}

export { getProjectPath };
