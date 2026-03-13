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

  ipcMain.handle('loop:pause', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    pauseLoop(win);
    return { status: 'ok' };
  });

  ipcMain.handle('loop:resume', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    resumeLoop(win);
    return { status: 'ok' };
  });

  ipcMain.handle('loop:stop', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    stopLoop(win);
    return { status: 'ok' };
  });

  ipcMain.handle('loop:getState', async () => {
    return { state: getLoopState() };
  });
}
