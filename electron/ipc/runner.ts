import { ipcMain, BrowserWindow } from 'electron';
import { detectRunCommand, startProject, stopProject, isProjectRunning } from '../runner/projectRunner';
import { getProjectPath } from '../db/projectLookup';

export function registerRunnerHandlers(): void {
  ipcMain.handle('runner:detect', async (_event, projectId: string) => {
    const projectPath = getProjectPath(projectId);
    return detectRunCommand(projectPath);
  });

  ipcMain.handle('runner:start', async (_event, projectId: string, command?: string, args?: string[]) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) throw new Error('No active window');

    const projectPath = getProjectPath(projectId);

    if (command) {
      startProject(projectPath, command, args || [], win);
    } else {
      const detected = detectRunCommand(projectPath);
      if (!detected) throw new Error('Could not detect run command');
      startProject(projectPath, detected.command, detected.args, win);
    }
    return { status: 'ok' };
  });

  ipcMain.handle('runner:stop', async () => {
    stopProject();
    return { status: 'ok' };
  });

  ipcMain.handle('runner:isRunning', async () => {
    return isProjectRunning();
  });
}
