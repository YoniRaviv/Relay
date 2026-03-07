import { ipcMain } from 'electron';

export function registerGitHandlers(): void {
  ipcMain.handle('git:diff', async () => {
    // Placeholder — implemented in Phase 6
    return '';
  });

  ipcMain.handle('git:commit', async () => {
    return { status: 'not_implemented' };
  });

  ipcMain.handle('git:log', async () => {
    return [];
  });

  ipcMain.handle('git:status', async () => {
    return { clean: true, files: [] };
  });
}
