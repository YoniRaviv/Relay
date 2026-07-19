import { spawn, type ChildProcess } from 'node:child_process';

let child: ChildProcess | null = null;
let awakeUntil: number | null = null;

/** Hold the Mac awake (idle sleep only) for `seconds`. Replaces any existing hold. macOS only. */
export function startCaffeinate(seconds: number): { awakeUntil: number | null } {
  stopCaffeinate();
  if (process.platform !== 'darwin' || seconds <= 0) return { awakeUntil: null };
  child = spawn('caffeinate', ['-i', '-t', String(Math.floor(seconds))], { stdio: 'ignore' });
  awakeUntil = Date.now() + seconds * 1000;
  child.on('exit', () => { child = null; awakeUntil = null; });
  return { awakeUntil };
}

export function stopCaffeinate(): { awakeUntil: null } {
  if (child) { try { child.kill(); } catch { /* already gone */ } child = null; }
  awakeUntil = null;
  return { awakeUntil: null };
}

export function caffeinateState(): { awakeUntil: number | null } {
  return { awakeUntil };
}
