import { ipcMain } from 'electron';

export function registerTasksHandlers(): void {
  ipcMain.handle('tasks:list', async () => {
    // Placeholder — implemented in Phase 4
    return [];
  });

  ipcMain.handle('tasks:update', async () => {
    return { status: 'not_implemented' };
  });

  ipcMain.handle('tasks:reorder', async () => {
    return { status: 'not_implemented' };
  });
}
