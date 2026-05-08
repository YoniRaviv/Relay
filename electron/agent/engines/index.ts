import { store } from '../../ipc/settings';
import { sdkEngine } from './sdkEngine';
import { cliEngine } from './cliEngine';
import { codexEngine } from './codexEngine';
import type { TaskEngine, EngineMode } from './types';

export function getEngine(): TaskEngine {
  const mode = (store.get('engineMode') ?? 'claude-code') as EngineMode;
  if (mode === 'codex') return codexEngine;
  return mode === 'claude-code' ? cliEngine : sdkEngine;
}

export function cleanupEngine(): void {
  // No-op — kept for future per-engine cleanup needs
}

export type { TaskEngine, TaskRunResult, EngineMode, CliToolsPreset } from './types';
