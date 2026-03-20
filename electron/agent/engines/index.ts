import { store } from '../../ipc/settings';
import { sdkEngine } from './sdkEngine';
import { cliEngine, endCliSession } from './cliEngine';
import type { TaskEngine, EngineMode } from './types';

export function getEngine(): TaskEngine {
  const mode = (store.get('engineMode') ?? 'claude-code') as EngineMode;
  return mode === 'claude-code' ? cliEngine : sdkEngine;
}

export function cleanupEngine(): void {
  endCliSession();
}

export type { TaskEngine, TaskRunResult, EngineMode, CliToolsPreset } from './types';
