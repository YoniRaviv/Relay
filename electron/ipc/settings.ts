import { ipcMain, safeStorage, app } from 'electron';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import Store from 'electron-store';
import type { AuthStatus, EngineMode, CliToolsPreset, BuildMode } from '../../shared/types';

const store = new Store<{
  apiKey?: string;
  recentProjects?: Array<{ name: string; path: string; lastOpened: string }>;
  engineMode?: EngineMode;
  cliToolsPreset?: CliToolsPreset;
  selectedModel?: string;
  maxPassesPerTask?: number;
  buildMode?: BuildMode;
  commitPrefix?: string;
  notificationsEnabled?: boolean;
}>();

const isDev = !app.isPackaged;

function findClaudeBinary(): { found: boolean; path?: string; error?: string } {
  // Try `which claude` first
  try {
    const homedir = os.homedir();
    const extraPaths = [
      `${homedir}/.local/bin`,
      `${homedir}/.nvm/versions/node/current/bin`,
      '/usr/local/bin',
      '/opt/homebrew/bin',
    ];
    const envPath = [...extraPaths, process.env.PATH ?? ''].join(':');
    const claudePath = execFileSync('which', ['claude'], {
      encoding: 'utf-8',
      env: { ...process.env, PATH: envPath },
    }).trim();
    return { found: true, path: claudePath };
  } catch {
    return { found: false, error: 'Claude Code CLI not found. Install it with: npm install -g @anthropic-ai/claude-code' };
  }
}

export function registerSettingsHandlers(): void {
  ipcMain.handle('cc:checkAuth', async (): Promise<AuthStatus> => {
    // In CLI engine mode, verify the CLI is actually available
    const engineMode = (store.get('engineMode') ?? 'api-key') as EngineMode;
    if (engineMode === 'claude-code') {
      const cliCheck = findClaudeBinary();
      return cliCheck.found
        ? { valid: true }
        : { valid: false, error: 'Claude Code CLI not found. Install it or switch to API Key mode.' };
    }

    // In dev mode, allow a dummy key for testing without a real API key
    if (isDev && store.get('apiKey') === 'dev-bypass') {
      return { valid: true };
    }

    const encrypted = store.get('apiKey');
    if (!encrypted) return { valid: false };

    try {
      const key = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(Buffer.from(encrypted as string, 'base64'))
        : (encrypted as string);
      return { valid: key.startsWith('sk-ant-') };
    } catch {
      return { valid: false, error: 'Failed to decrypt API key' };
    }
  });

  ipcMain.handle('cc:setApiKey', async (_event, apiKey: string): Promise<AuthStatus> => {
    // Dev bypass: accept 'dev-bypass' as a valid key in dev mode
    if (isDev && apiKey === 'dev-bypass') {
      store.set('apiKey', 'dev-bypass');
      return { valid: true };
    }

    if (!apiKey || !apiKey.startsWith('sk-ant-')) {
      return { valid: false, error: 'Invalid API key format' };
    }

    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(apiKey).toString('base64');
        store.set('apiKey', encrypted);
      } else {
        store.set('apiKey', apiKey);
      }
      return { valid: true };
    } catch {
      return { valid: false, error: 'Failed to store API key' };
    }
  });

  ipcMain.handle('cc:getApiKey', async (): Promise<string | null> => {
    const encrypted = store.get('apiKey');
    if (!encrypted) return null;

    try {
      return safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(Buffer.from(encrypted as string, 'base64'))
        : (encrypted as string);
    } catch {
      return null;
    }
  });

  ipcMain.handle('cc:getAppInfo', async () => {
    return {
      version: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
    };
  });

  ipcMain.handle('cc:getSettings', async () => {
    return {
      hasApiKey: !!store.get('apiKey'),
      recentProjects: store.get('recentProjects', []),
    };
  });

  // Engine mode
  ipcMain.handle('cc:getEngineMode', async (): Promise<EngineMode> => {
    return (store.get('engineMode') ?? 'api-key') as EngineMode;
  });

  ipcMain.handle('cc:setEngineMode', async (_event, mode: EngineMode): Promise<void> => {
    store.set('engineMode', mode);
  });

  // CLI tools preset
  ipcMain.handle('cc:getCliToolsPreset', async (): Promise<CliToolsPreset> => {
    return (store.get('cliToolsPreset') ?? 'conservative') as CliToolsPreset;
  });

  ipcMain.handle('cc:setCliToolsPreset', async (_event, preset: CliToolsPreset): Promise<void> => {
    store.set('cliToolsPreset', preset);
  });

  // Model selection
  ipcMain.handle('cc:getSelectedModel', async (): Promise<string> => {
    return (store.get('selectedModel') ?? 'claude-sonnet-4-20250514') as string;
  });

  ipcMain.handle('cc:setSelectedModel', async (_event, model: string): Promise<void> => {
    store.set('selectedModel', model);
  });

  // Check if Claude Code CLI binary is installed and reachable
  ipcMain.handle('cc:checkCliAvailable', async (): Promise<{ available: boolean; path?: string; error?: string }> => {
    const result = findClaudeBinary();
    return result.found
      ? { available: true, path: result.path }
      : { available: false, error: result.error };
  });

  // Max passes per task
  ipcMain.handle('cc:getMaxPasses', async (): Promise<number> => {
    return store.get('maxPassesPerTask', 5) as number;
  });

  ipcMain.handle('cc:setMaxPasses', async (_event, max: number): Promise<void> => {
    store.set('maxPassesPerTask', max);
  });

  // Build mode
  ipcMain.handle('cc:getBuildMode', async (): Promise<BuildMode> => {
    const mode = (store.get('buildMode') ?? 'review') as string;
    // Migrate legacy value
    if (mode === 'auto-commit') {
      store.set('buildMode', 'auto-pilot');
      return 'auto-pilot';
    }
    return mode as BuildMode;
  });

  ipcMain.handle('cc:setBuildMode', async (_event, mode: BuildMode): Promise<void> => {
    store.set('buildMode', mode);
  });

  // Commit prefix
  ipcMain.handle('cc:getCommitPrefix', async (): Promise<string> => {
    return (store.get('commitPrefix') ?? 'feat') as string;
  });

  ipcMain.handle('cc:setCommitPrefix', async (_event, prefix: string): Promise<void> => {
    store.set('commitPrefix', prefix);
  });

  // Desktop notifications
  ipcMain.handle('cc:getNotificationsEnabled', async (): Promise<boolean> => {
    return store.get('notificationsEnabled', true) as boolean;
  });

  ipcMain.handle('cc:setNotificationsEnabled', async (_event, enabled: boolean): Promise<void> => {
    store.set('notificationsEnabled', enabled);
  });
}

export { store };
