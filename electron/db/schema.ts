import type Database from 'better-sqlite3';

export function initializeDatabase(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS prd (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      description TEXT NOT NULL DEFAULT '',
      markdown TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      prd_id TEXT NOT NULL REFERENCES prd(id),
      story_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      acceptance_criteria TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'pending',
      "order" INTEGER NOT NULL DEFAULT 0,
      passes INTEGER NOT NULL DEFAULT 0,
      rejection_notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_logs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_metrics (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      duration_ms INTEGER NOT NULL DEFAULT 0,
      tokens_in INTEGER NOT NULL DEFAULT 0,
      tokens_out INTEGER NOT NULL DEFAULT 0,
      tool_calls INTEGER NOT NULL DEFAULT 0,
      passes INTEGER NOT NULL DEFAULT 0,
      model TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Create indexes for common query patterns
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_prd_project_id ON prd(project_id);
    CREATE INDEX IF NOT EXISTS idx_prd_created_at ON prd(created_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_project_prd ON tasks(project_id, prd_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_prd_status ON tasks(prd_id, status);
    CREATE INDEX IF NOT EXISTS idx_tasks_status_order ON tasks(status, "order");
    CREATE INDEX IF NOT EXISTS idx_task_logs_task_id ON task_logs(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_metrics_task_id ON task_metrics(task_id);
  `);

  // ── Versioned migrations ──
  // Create schema_version table to track applied migrations
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)`);
  const currentVersion = (db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null })?.v ?? 0;

  const migrations: Array<{ version: number; description: string; up: () => void }> = [
    {
      version: 1,
      description: 'Add model column to task_metrics',
      up: () => {
        const cols = db.pragma('table_info(task_metrics)') as Array<{ name: string }>;
        if (!cols.some(c => c.name === 'model')) {
          db.exec(`ALTER TABLE task_metrics ADD COLUMN model TEXT`);
        }
      },
    },
    {
      version: 2,
      description: 'Add context column to projects',
      up: () => {
        const cols = db.pragma('table_info(projects)') as Array<{ name: string }>;
        if (!cols.some(c => c.name === 'context')) {
          db.exec(`ALTER TABLE projects ADD COLUMN context TEXT`);
        }
      },
    },
    {
      version: 3,
      description: 'Add commit_hash column to tasks',
      up: () => {
        const cols = db.pragma('table_info(tasks)') as Array<{ name: string }>;
        if (!cols.some(c => c.name === 'commit_hash')) {
          db.exec(`ALTER TABLE tasks ADD COLUMN commit_hash TEXT`);
        }
      },
    },
    {
      version: 4,
      description: 'Add feature_branch column to prd',
      up: () => {
        const cols = db.pragma('table_info(prd)') as Array<{ name: string }>;
        if (!cols.some(c => c.name === 'feature_branch')) {
          db.exec(`ALTER TABLE prd ADD COLUMN feature_branch TEXT`);
        }
      },
    },
  ];

  // Run pending migrations inside a transaction
  const pendingMigrations = migrations.filter(m => m.version > currentVersion);
  if (pendingMigrations.length > 0) {
    const runMigrations = db.transaction(() => {
      for (const m of pendingMigrations) {
        m.up();
        db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(m.version);
        console.log(`[schema] Migration ${m.version}: ${m.description}`);
      }
    });
    runMigrations();
  }

  // Recovery: reset orphaned in_progress tasks from previous crashed sessions
  // These tasks were being built when the app crashed — reset to pending so the loop can retry
  const orphaned = db.prepare(
    `UPDATE tasks SET status = 'pending', updated_at = datetime('now') WHERE status = 'in_progress'`
  ).run();
  if (orphaned.changes > 0) {
    console.warn(`[schema] Recovered ${orphaned.changes} orphaned in_progress task(s) from previous session`);
  }
}
