import { ipcMain, BrowserWindow } from 'electron';
import { startLoop, pauseLoop, resumeLoop, stopLoop, getLoopState } from '../agent/loopController';
import type { BuildMode } from '../../shared/types';
import { withSentry } from './withSentry';

export function registerAgentHandlers(): void {
  ipcMain.handle('loop:start', withSentry('loop:start', async (_event, projectId: string, prdId?: string, buildMode?: BuildMode) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) throw new Error('No active window');
    // Start loop in background — catch errors and emit to renderer
    startLoop(projectId, win, prdId, buildMode).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[agent] Loop crashed:', message);
      try {
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
          win.webContents.send('agent:error', { message });
          win.webContents.send('loop:stateChange', { state: 'idle' });
        }
      } catch { /* window already gone */ }
    });
    return { status: 'ok' };
  }));

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
