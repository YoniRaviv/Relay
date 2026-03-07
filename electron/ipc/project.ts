import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { openDb } from '../db/connection';
import { store } from './settings';
import type { Project, RecentProject } from '../../shared/types';

export function registerProjectHandlers(): void {
  ipcMain.handle('project:create', async (_event, params: { name: string; path: string }): Promise<Project> => {
    const relayDir = path.join(params.path, '.relay');
    if (!fs.existsSync(relayDir)) {
      fs.mkdirSync(relayDir, { recursive: true });
    }

    const db = openDb(params.path);
    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO projects (id, name, path, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)`
    ).run(id, params.name, params.path, now, now);

    const project: Project = { id, name: params.name, path: params.path, status: 'active', createdAt: now, updatedAt: now };

    addToRecent(project);
    return project;
  });

  ipcMain.handle('project:open', async (_event, projectPath: string): Promise<Project | null> => {
    const dbPath = path.join(projectPath, '.relay', 'relay.db');
    if (!fs.existsSync(dbPath)) return null;

    const db = openDb(projectPath);
    const row = db.prepare(`SELECT * FROM projects WHERE path = ? LIMIT 1`).get(projectPath) as Record<string, unknown> | undefined;
    if (!row) return null;

    const project: Project = {
      id: row.id as string,
      name: row.name as string,
      path: row.path as string,
      status: row.status as Project['status'],
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };

    addToRecent(project);
    return project;
  });

  ipcMain.handle('project:list', async (): Promise<RecentProject[]> => {
    return store.get('recentProjects', []) as RecentProject[];
  });

  ipcMain.handle('project:selectFolder', async (): Promise<string | null> => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
}

function addToRecent(project: Project): void {
  const recents = store.get('recentProjects', []) as RecentProject[];
  const filtered = recents.filter((r) => r.path !== project.path);
  filtered.unshift({ name: project.name, path: project.path, lastOpened: new Date().toISOString() });
  store.set('recentProjects', filtered.slice(0, 10));
}
