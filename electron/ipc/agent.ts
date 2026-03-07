import { ipcMain } from 'electron';

export function registerAgentHandlers(): void {
  ipcMain.handle('loop:start', async () => {
    // Placeholder — implemented in Phase 5
    return { status: 'not_implemented' };
  });

  ipcMain.handle('loop:pause', async () => {
    return { status: 'not_implemented' };
  });

  ipcMain.handle('loop:resume', async () => {
    return { status: 'not_implemented' };
  });

  ipcMain.handle('loop:stop', async () => {
    return { status: 'not_implemented' };
  });
}
