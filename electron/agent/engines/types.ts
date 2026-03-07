import type { BrowserWindow } from 'electron';
import type { Task } from '../../../shared/types';

export interface TaskRunResult {
  success: boolean;
  tokensIn: number;
  tokensOut: number;
  toolCalls: number;
  durationMs: number;
  error?: string;
}

export interface TaskEngine {
  runTask(
    task: Task,
    win: BrowserWindow,
    abortSignal: { aborted: boolean }
  ): Promise<TaskRunResult>;
}

export type EngineMode = 'api-key' | 'claude-code';

export type CliToolsPreset = 'conservative' | 'full';
