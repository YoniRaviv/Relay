import { ipcMain } from 'electron';
import { openDb } from '../db/connection';
import { store } from './settings';
import type { Task } from '../../shared/types';

function getDbForProject(projectId: string) {
  const projects = store.get('recentProjects', []) as Array<{ path: string }>;
  for (const p of projects) {
    try {
      const db = openDb(p.path);
      const row = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
      if (row) return db;
    } catch {
      continue;
    }
  }
  throw new Error('Project not found');
}

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    prdId: row.prd_id as string,
    storyId: row.story_id as string,
    title: row.title as string,
    description: row.description as string,
    acceptanceCriteria: row.acceptance_criteria as string,
    priority: row.priority as Task['priority'],
    status: row.status as Task['status'],
    order: row.order as number,
    passes: row.passes as number,
    rejectionNotes: row.rejection_notes as string | null,
    commitHash: (row.commit_hash as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function registerTasksHandlers(): void {
  ipcMain.handle('tasks:list', async (_event, projectId: string, prdId?: string): Promise<Task[]> => {
    const db = getDbForProject(projectId);
    if (prdId) {
      const rows = db.prepare(
        `SELECT * FROM tasks WHERE project_id = ? AND prd_id = ? ORDER BY "order" ASC`
      ).all(projectId, prdId) as Record<string, unknown>[];
      return rows.map(rowToTask);
    }
    const rows = db.prepare(
      `SELECT * FROM tasks WHERE project_id = ? ORDER BY "order" ASC`
    ).all(projectId) as Record<string, unknown>[];
    return rows.map(rowToTask);
  });

  ipcMain.handle('tasks:update', async (_event, taskId: string, updates: Partial<Task>) => {
    // Find which project DB has this task
    const projects = store.get('recentProjects', []) as Array<{ path: string }>;
    for (const p of projects) {
      try {
        const db = openDb(p.path);
        const row = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
        if (!row) continue;

        const sets: string[] = [];
        const vals: unknown[] = [];

        if (updates.status !== undefined) { sets.push('status = ?'); vals.push(updates.status); }
        if (updates.order !== undefined) { sets.push('"order" = ?'); vals.push(updates.order); }
        if (updates.title !== undefined) { sets.push('title = ?'); vals.push(updates.title); }
        if (updates.passes !== undefined) { sets.push('passes = ?'); vals.push(updates.passes); }
        if (updates.rejectionNotes !== undefined) { sets.push('rejection_notes = ?'); vals.push(updates.rejectionNotes); }

        if (sets.length > 0) {
          sets.push('updated_at = ?');
          vals.push(new Date().toISOString());
          vals.push(taskId);
          db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
        }

        return { status: 'ok' };
      } catch (err) {
        console.error(`[tasks:update] DB error for ${p.path}:`, err instanceof Error ? err.message : err);
        continue;
      }
    }
    throw new Error('Task not found');
  });

  ipcMain.handle('tasks:reorder', async (_event, taskOrders: Array<{ id: string; order: number }>) => {
    const projects = store.get('recentProjects', []) as Array<{ path: string }>;
    for (const p of projects) {
      try {
        const db = openDb(p.path);
        const now = new Date().toISOString();
        const updateStmt = db.prepare(`UPDATE tasks SET "order" = ?, updated_at = ? WHERE id = ?`);
        const reorder = db.transaction((orders: typeof taskOrders) => {
          for (const { id, order } of orders) {
            updateStmt.run(order, now, id);
          }
        });
        reorder(taskOrders);
        return { status: 'ok' };
      } catch (err) {
        console.error(`[tasks:reorder] DB error for ${p.path}:`, err instanceof Error ? err.message : err);
        continue;
      }
    }
    throw new Error('Failed to reorder tasks');
  });
}
