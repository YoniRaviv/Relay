import { ipcMain } from 'electron';

export function registerMetricsHandlers(): void {
  ipcMain.handle('metrics:project', async () => {
    // Placeholder — implemented in Phase 7
    return {};
  });

  ipcMain.handle('metrics:task', async () => {
    return {};
  });

  ipcMain.handle('metrics:export', async () => {
    return { status: 'not_implemented' };
  });
}
