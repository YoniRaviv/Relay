import { ipcMain, BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { buildPrdPrompt, buildDecomposePrompt } from '../agent/prompts';
import { streamText, generateText } from '../agent/runner';
import { openDb } from '../db/connection';
import { store } from './settings';
import { safeStorage } from 'electron';

function getApiKey(): string {
  const encrypted = store.get('apiKey');
  if (!encrypted) throw new Error('No API key configured');
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(encrypted as string, 'base64'));
  }
  return encrypted as string;
}

export function registerPrdHandlers(): void {
  ipcMain.handle('prd:generate', async (_event, description: string) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) throw new Error('No active window');

    const apiKey = getApiKey();
    const prompt = buildPrdPrompt(description);

    await streamText(apiKey, 'You are a senior product manager.', prompt, win, 'prd:stream');
    return { status: 'ok' };
  });

  ipcMain.handle('prd:decompose', async (_event, prdMarkdown: string) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) throw new Error('No active window');

    const apiKey = getApiKey();
    const prompt = buildDecomposePrompt(prdMarkdown);

    const result = await generateText(apiKey, 'You are a senior software architect. Return only valid JSON.', prompt);
    win.webContents.send('prd:decomposeStream', { type: 'done', text: result });
    return { status: 'ok' };
  });

  ipcMain.handle('prd:save', async (_event, data: {
    projectId: string;
    description: string;
    markdown: string;
    tasks: Array<{
      storyId: string;
      title: string;
      description: string;
      acceptanceCriteria: string;
      priority: string;
    }>;
  }) => {
    const project = store.get('recentProjects', []) as Array<{ path: string }>;
    const recentProject = project.find(p => {
      const db = openDb(p.path);
      const row = db.prepare('SELECT id FROM projects WHERE id = ?').get(data.projectId);
      return !!row;
    });

    if (!recentProject) throw new Error('Project not found');

    const db = openDb(recentProject.path);
    const prdId = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO prd (id, project_id, description, markdown, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'approved', ?, ?)`
    ).run(prdId, data.projectId, data.description, data.markdown, now, now);

    const insertTask = db.prepare(
      `INSERT INTO tasks (id, project_id, prd_id, story_id, title, description, acceptance_criteria, priority, status, "order", passes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 0, ?, ?)`
    );

    const insertMany = db.transaction((tasks: typeof data.tasks) => {
      tasks.forEach((task, i) => {
        insertTask.run(
          randomUUID(), data.projectId, prdId, task.storyId,
          task.title, task.description, task.acceptanceCriteria,
          task.priority, i, now, now
        );
      });
    });

    insertMany(data.tasks);
    return { status: 'ok', prdId };
  });

  ipcMain.handle('prd:get', async (_event, projectId: string) => {
    const projects = store.get('recentProjects', []) as Array<{ path: string }>;
    for (const p of projects) {
      try {
        const db = openDb(p.path);
        const row = db.prepare(
          `SELECT * FROM prd WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`
        ).get(projectId) as Record<string, unknown> | undefined;
        if (row) {
          return {
            id: row.id,
            projectId: row.project_id,
            description: row.description,
            markdown: row.markdown,
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          };
        }
      } catch {
        continue;
      }
    }
    return null;
  });
}
