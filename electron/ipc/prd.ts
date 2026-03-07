import { ipcMain } from 'electron';

export function registerPrdHandlers(): void {
  ipcMain.handle('prd:generate', async () => {
    // Placeholder — implemented in Phase 3
    return { status: 'not_implemented' };
  });

  ipcMain.handle('prd:decompose', async () => {
    return { status: 'not_implemented' };
  });

  ipcMain.handle('prd:save', async () => {
    return { status: 'not_implemented' };
  });

  ipcMain.handle('prd:get', async () => {
    return null;
  });
}
