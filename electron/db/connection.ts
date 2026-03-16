import Database from 'better-sqlite3';
import path from 'node:path';
import { initializeDatabase } from './schema';

const connections = new Map<string, Database.Database>();
const lastAccess = new Map<string, number>();

// Close idle connections after 5 minutes
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export function openDb(projectPath: string): Database.Database {
  const dbPath = path.join(projectPath, '.relay', 'relay.db');

  const existing = connections.get(dbPath);
  if (existing) {
    lastAccess.set(dbPath, Date.now());
    return existing;
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initializeDatabase(db);

  connections.set(dbPath, db);
  lastAccess.set(dbPath, Date.now());
  return db;
}

export function closeDb(projectPath: string): void {
  const dbPath = path.join(projectPath, '.relay', 'relay.db');
  const db = connections.get(dbPath);
  if (db) {
    db.close();
    connections.delete(dbPath);
    lastAccess.delete(dbPath);
  }
}

export function closeAllDbs(): void {
  for (const db of connections.values()) {
    db.close();
  }
  connections.clear();
  lastAccess.clear();
  if (idleTimer) {
    clearInterval(idleTimer);
    idleTimer = null;
  }
}

/** Close connections that haven't been accessed in IDLE_TIMEOUT_MS */
function closeIdleConnections(): void {
  const now = Date.now();
  for (const [dbPath, accessTime] of lastAccess.entries()) {
    if (now - accessTime > IDLE_TIMEOUT_MS) {
      const db = connections.get(dbPath);
      if (db) {
        try { db.close(); } catch { /* already closed */ }
        connections.delete(dbPath);
        lastAccess.delete(dbPath);
        console.log(`[db] Closed idle connection: ${dbPath}`);
      }
    }
  }
}

// Run cleanup every 2 minutes
let idleTimer: ReturnType<typeof setInterval> | null = setInterval(closeIdleConnections, 2 * 60 * 1000);
