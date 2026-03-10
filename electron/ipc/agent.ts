import { ipcMain, BrowserWindow } from 'electron';
import { startLoop, pauseLoop, resumeLoop, stopLoop, getLoopState } from '../agent/loopController';
import type { BuildMode } from '../../shared/types';

export function registerAgentHandlers(): void {
  ipcMain.handle('loop:start', async (_event, projectId: string, prdId?: string, buildMode?: BuildMode) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) throw new Error('No active window');
    // Start loop in background (don't await — it runs until done/stopped)
    startLoop(projectId, win, prdId, buildMode);
    return { status: 'ok' };
  });

  ipcMain.handle('loop:pause', async () => {
    pauseLoop();
    return { status: 'ok' };
  });

  ipcMain.handle('loop:resume', async () => {
    resumeLoop();
    return { status: 'ok' };
  });

  ipcMain.handle('loop:stop', async () => {
    stopLoop();
    return { status: 'ok' };
  });

  ipcMain.handle('loop:getState', async () => {
    return { state: getLoopState() };
  });
}
