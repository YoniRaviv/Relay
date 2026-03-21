import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
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
    dependsOn: (row.depends_on as string | null) ?? null,
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
        if (updates.description !== undefined) { sets.push('description = ?'); vals.push(updates.description); }
        if (updates.acceptanceCriteria !== undefined) { sets.push('acceptance_criteria = ?'); vals.push(updates.acceptanceCriteria); }
        if (updates.priority !== undefined) { sets.push('priority = ?'); vals.push(updates.priority); }
        if (updates.dependsOn !== undefined) { sets.push('depends_on = ?'); vals.push(updates.dependsOn); }

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

  ipcMain.handle('tasks:create', async (_event, params: {
    projectId: string;
    prdId: string;
    title: string;
    description: string;
    acceptanceCriteria: string;
    priority: string;
  }) => {
    const db = getDbForProject(params.projectId);
    const id = randomUUID();
    const now = new Date().toISOString();

    // Auto-generate storyId from existing tasks count
    const countRow = db.prepare(
      `SELECT COUNT(*) as count FROM tasks WHERE prd_id = ?`
    ).get(params.prdId) as { count: number };
    const storyId = `TASK-${String(countRow.count + 1).padStart(3, '0')}`;

    // Set order to max + 1
    const maxRow = db.prepare(
      `SELECT MAX("order") as maxOrder FROM tasks WHERE prd_id = ?`
    ).get(params.prdId) as { maxOrder: number | null };
    const order = (maxRow.maxOrder ?? -1) + 1;

    db.prepare(
      `INSERT INTO tasks (id, project_id, prd_id, story_id, title, description, acceptance_criteria, priority, status, "order", passes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 0, ?, ?)`
    ).run(id, params.projectId, params.prdId, storyId, params.title, params.description, params.acceptanceCriteria, params.priority, order, now, now);

    return { status: 'ok', task: rowToTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown>) };
  });

  ipcMain.handle('tasks:delete', async (_event, taskId: string) => {
    const projects = store.get('recentProjects', []) as Array<{ path: string }>;
    for (const p of projects) {
      try {
        const db = openDb(p.path);
        const row = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
        if (!row) continue;

        // Delete related logs and metrics first (FK constraints)
        db.prepare('DELETE FROM task_metrics WHERE task_id = ?').run(taskId);
        db.prepare('DELETE FROM task_logs WHERE task_id = ?').run(taskId);
        db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
        return { status: 'ok' };
      } catch (err) {
        console.error(`[tasks:delete] DB error for ${p.path}:`, err instanceof Error ? err.message : err);
        continue;
      }
    }
    throw new Error('Task not found');
  });

  ipcMain.handle('tasks:getLogs', async (_event, taskId: string) => {
    const projects = store.get('recentProjects', []) as Array<{ path: string }>;
    for (const p of projects) {
      try {
        const db = openDb(p.path);
        const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
        if (!task) continue;

        const rows = db.prepare(
          `SELECT * FROM task_logs WHERE task_id = ? ORDER BY timestamp ASC`
        ).all(taskId) as Record<string, unknown>[];

        return rows.map(row => ({
          id: row.id as string,
          taskId: row.task_id as string,
          type: row.type as string,
          content: row.content as string,
          timestamp: row.timestamp as string,
        }));
      } catch { continue; }
    }
    return [];
  });
}
