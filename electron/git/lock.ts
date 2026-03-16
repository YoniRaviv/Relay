import fs from 'node:fs';
import path from 'node:path';

/**
 * Simple promise-based mutex for git operations.
 * Prevents concurrent git operations that cause lock file conflicts.
 */
let pending = Promise.resolve();

export function withGitLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = pending.then(fn, fn);
  pending = next.then(() => {}, () => {});
  return next;
}

/**
 * Remove stale .git/index.lock files left behind by crashed processes.
 * Should be called before starting the agent loop on a project.
 */
export function cleanStaleLockFile(projectPath: string): void {
  const lockFile = path.join(projectPath, '.git', 'index.lock');
  try {
    if (fs.existsSync(lockFile)) {
      fs.unlinkSync(lockFile);
      console.warn(`[git] Removed stale index.lock: ${lockFile}`);
    }
  } catch {
    // Best effort — if we can't remove it, git operations will fail with a clear error
  }
}
