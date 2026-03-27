import { openDb } from './connection';
import { store } from '../ipc/settings';
import type Database from 'better-sqlite3';

/**
 * Resolve a project ID to its database connection.
 * Iterates recent projects to find which DB contains the project.
 */
export function getDbForProject(projectId: string): Database.Database {
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

/**
 * Resolve a project ID to its filesystem path.
 */
export function getProjectPath(projectId: string): string {
  const projects = store.get('recentProjects', []) as Array<{ path: string }>;
  for (const p of projects) {
    try {
      const db = openDb(p.path);
      const row = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
      if (row) return p.path;
    } catch {
      continue;
    }
  }
  throw new Error('Project path not found');
}
