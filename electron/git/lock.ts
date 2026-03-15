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
