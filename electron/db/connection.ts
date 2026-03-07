import Database from 'better-sqlite3';
import path from 'node:path';
import { initializeDatabase } from './schema';

const connections = new Map<string, Database.Database>();

export function openDb(projectPath: string): Database.Database {
  const dbPath = path.join(projectPath, '.relay', 'relay.db');

  const existing = connections.get(dbPath);
  if (existing) return existing;

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initializeDatabase(db);

  connections.set(dbPath, db);
  return db;
}

export function closeDb(projectPath: string): void {
  const dbPath = path.join(projectPath, '.relay', 'relay.db');
  const db = connections.get(dbPath);
  if (db) {
    db.close();
    connections.delete(dbPath);
  }
}

export function closeAllDbs(): void {
  for (const db of connections.values()) {
    db.close();
  }
  connections.clear();
}
