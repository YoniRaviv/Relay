import { ipcMain, safeStorage } from 'electron';
import Store from 'electron-store';
import type { AuthStatus } from '../../shared/types';

const store = new Store<{ apiKey?: string; recentProjects?: Array<{ name: string; path: string; lastOpened: string }> }>();

export function registerSettingsHandlers(): void {
  ipcMain.handle('cc:checkAuth', async (): Promise<AuthStatus> => {
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
}

export { store };
