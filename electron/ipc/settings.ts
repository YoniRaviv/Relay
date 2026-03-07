import { ipcMain, safeStorage, app } from 'electron';
import Store from 'electron-store';
import type { AuthStatus, EngineMode, CliToolsPreset } from '../../shared/types';

const store = new Store<{
  apiKey?: string;
  recentProjects?: Array<{ name: string; path: string; lastOpened: string }>;
  engineMode?: EngineMode;
  cliToolsPreset?: CliToolsPreset;
  selectedModel?: string;
}>();

const isDev = !app.isPackaged;

export function registerSettingsHandlers(): void {
  ipcMain.handle('cc:checkAuth', async (): Promise<AuthStatus> => {
    // In CLI engine mode, no API key needed
    const engineMode = (store.get('engineMode') ?? 'api-key') as EngineMode;
    if (engineMode === 'claude-code') {
      return { valid: true };
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

  // Check if Claude Code CLI SDK is available
  ipcMain.handle('cc:checkCliAvailable', async (): Promise<{ available: boolean; error?: string }> => {
    try {
      await import('@anthropic-ai/claude-agent-sdk');
      return { available: true };
    } catch {
      return { available: false, error: 'Claude Code SDK not available. Run `claude login` in your terminal first.' };
    }
  });
}

export { store };
