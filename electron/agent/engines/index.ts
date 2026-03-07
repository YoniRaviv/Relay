import { store } from '../../ipc/settings';
import { sdkEngine } from './sdkEngine';
import { cliEngine } from './cliEngine';
import type { TaskEngine, EngineMode } from './types';

export function getEngine(): TaskEngine {
  const mode = (store.get('engineMode') ?? 'api-key') as EngineMode;
  return mode === 'claude-code' ? cliEngine : sdkEngine;
}

export type { TaskEngine, TaskRunResult, EngineMode, CliToolsPreset } from './types';
