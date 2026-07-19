import path from 'node:path';
import { createRequire } from 'node:module';

export const POLL_INTERVAL_MS = 2000;
export const LOCAL_CAP = 2;
export const WATCHDOG_TIMEOUT_MS = Number(process.env.RELAY_SCHED_WATCHDOG_MS) || 10 * 60 * 1000;

const require = createRequire(import.meta.url);

/** Lazy: keeps this module electron-free at import time so pure-logic tests can load dispatch.ts. */
export function tasksRoot(): string {
  const { app } = require('electron') as { app: { getPath(name: string): string } };
  return path.join(app.getPath('userData'), 'scheduler-workspaces');
}
