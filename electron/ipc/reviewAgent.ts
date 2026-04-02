import { ipcMain, BrowserWindow } from 'electron';
import { withSentry } from './withSentry';
import { runAnalysis, runFix, cancelReview, getReviewSession } from '../agent/reviewRunner';
import { store } from './settings';
import { openDb } from '../db/connection';

function getProjectIdForPrd(prdId: string): string {
  const projects = store.get('recentProjects', []) as Array<{ path: string }>;
  for (const p of projects) {
    try {
      const db = openDb(p.path);
      const row = db.prepare('SELECT project_id FROM prd WHERE id = ?').get(prdId) as Record<string, unknown> | undefined;
      if (row) return row.project_id as string;
    } catch { continue; }
  }
  throw new Error('PRD not found');
}

export function registerReviewAgentHandlers(): void {
  ipcMain.handle('reviewAgent:analyze', withSentry('reviewAgent:analyze', async (_event, prdId: string) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) throw new Error('No active window');
    const projectId = getProjectIdForPrd(prdId);
    return runAnalysis(prdId, projectId, win);
  }));

  ipcMain.handle('reviewAgent:fix', withSentry('reviewAgent:fix', async (_event, params: { sessionId: string; selectedIds: string[] }) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) throw new Error('No active window');

    // Find projectId from session
    const projects = store.get('recentProjects', []) as Array<{ path: string }>;
    let projectId = '';
    for (const p of projects) {
      try {
        const db = openDb(p.path);
        const row = db.prepare(`
          SELECT p.project_id FROM review_sessions rs
          JOIN prd p ON rs.prd_id = p.id
          WHERE rs.id = ?
        `).get(params.sessionId) as Record<string, unknown> | undefined;
        if (row) { projectId = row.project_id as string; break; }
      } catch { continue; }
    }
    if (!projectId) throw new Error('Session not found');

    return runFix(params.sessionId, params.selectedIds, projectId, win);
  }));

  ipcMain.handle('reviewAgent:cancel', async () => {
    cancelReview();
  });

  ipcMain.handle('reviewAgent:getSession', async (_event, prdId: string) => {
    const projectId = getProjectIdForPrd(prdId);
    return getReviewSession(prdId, projectId);
  });
}
