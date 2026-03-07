// Re-export for backward compatibility — actual implementation in engines/sdkEngine.ts
import { sdkEngine } from './engines/sdkEngine';
import type { TaskRunResult } from './engines/types';
import type { BrowserWindow } from 'electron';
import type { Task } from '../../shared/types';

export type { TaskRunResult };

export function runTask(
  task: Task,
  win: BrowserWindow,
  abortSignal: { aborted: boolean }
): Promise<TaskRunResult> {
  return sdkEngine.runTask(task, win, abortSignal);
}
