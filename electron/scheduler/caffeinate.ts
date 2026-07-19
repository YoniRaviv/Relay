import { spawn, type ChildProcess } from 'node:child_process';

let child: ChildProcess | null = null;
let manualUntil: number | null = null;
let autoUntil: number | null = null;
let spawnedUntil: number | null = null; // effective target the live child was spawned for

/** Effective hold = the later of the manual (IPC) hold and the auto (scheduler) hold. */
function effective(): number | null {
  if (manualUntil == null) return autoUntil;
  if (autoUntil == null) return manualUntil;
  return Math.max(manualUntil, autoUntil);
}

/**
 * (Re)spawn the single `caffeinate -i -t` child for the current effective hold.
 * Cheap and idempotent — callers may invoke this every tick. Only actually
 * touches the child process on a null↔active transition or when the target
 * moves by more than 60s, so a steady/refreshing hold doesn't thrash it.
 */
function apply(): void {
  const target = process.platform === 'darwin' ? effective() : null;
  if (target == null) {
    if (child) { try { child.kill(); } catch { /* already gone */ } child = null; }
    spawnedUntil = null;
    return;
  }
  if (spawnedUntil != null && Math.abs(target - spawnedUntil) <= 60_000) return;
  if (child) { try { child.kill(); } catch { /* already gone */ } child = null; }
  const seconds = Math.ceil((target - Date.now()) / 1000);
  if (seconds <= 0) { spawnedUntil = null; return; }
  child = spawn('caffeinate', ['-i', '-t', String(seconds)], { stdio: 'ignore' });
  spawnedUntil = target;
  child.on('exit', () => { child = null; spawnedUntil = null; });
}

/** Manual/IPC hold: hold the Mac awake (idle sleep only) for `seconds`. macOS only. */
export function startCaffeinate(seconds: number): { awakeUntil: number | null } {
  manualUntil = process.platform === 'darwin' && seconds > 0 ? Date.now() + seconds * 1000 : null;
  apply();
  return caffeinateState();
}

/** Clears the manual hold only — an auto hold from a running job survives this. */
export function stopCaffeinate(): { awakeUntil: number | null } {
  manualUntil = null;
  apply();
  return caffeinateState();
}

/** Auto hold: driven by the scheduler while jobs are running (not the IPC surface). */
export function autoHold(seconds: number): void {
  if (process.platform !== 'darwin' || seconds <= 0) return;
  autoUntil = Date.now() + seconds * 1000;
  apply();
}

export function autoRelease(): void {
  autoUntil = null;
  apply();
}

/** Clears both holds and kills the child — used on scheduler shutdown. */
export function stopAllCaffeinate(): { awakeUntil: null } {
  manualUntil = null;
  autoUntil = null;
  if (child) { try { child.kill(); } catch { /* already gone */ } child = null; }
  spawnedUntil = null;
  return { awakeUntil: null };
}

export function caffeinateState(): { awakeUntil: number | null } {
  return { awakeUntil: effective() };
}
