import type { BrowserWindow } from 'electron';
import type { Task } from '../../../shared/types';

export interface TaskRunResult {
  success: boolean;
  tokensIn: number;
  tokensOut: number;
  toolCalls: number;
  durationMs: number;
  model?: string;
  error?: string;
}

export interface TaskEngine {
  runTask(
    task: Task,
    win: BrowserWindow,
    abortSignal: { aborted: boolean }
  ): Promise<TaskRunResult>;
}

export type { EngineMode } from '../../../shared/types';

export type CliToolsPreset = 'conservative' | 'full';
