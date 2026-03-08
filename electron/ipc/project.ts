import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { openDb } from '../db/connection';
import { store } from './settings';
import type { Project, RecentProject } from '../../shared/types';

const CONTEXT_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  'README.md',
  'package.json',
  'tsconfig.json',
  'Cargo.toml',
  'pyproject.toml',
  'go.mod',
  'Gemfile',
  'build.gradle',
  'pom.xml',
];

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.relay', 'dist', 'build', '.next',
  '.nuxt', 'target', '__pycache__', '.venv', 'venv', 'vendor',
  '.idea', '.vscode', 'coverage', '.turbo', '.cache',
]);

function getDirectoryTree(dirPath: string, depth = 0, maxDepth = 3): string {
  if (depth >= maxDepth) return '';
  let result = '';

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const filtered = entries
      .filter(e => !e.name.startsWith('.') || e.name === '.env.example')
      .filter(e => !IGNORE_DIRS.has(e.name))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

    for (const entry of filtered) {
      const indent = '  '.repeat(depth);
      if (entry.isDirectory()) {
        result += `${indent}${entry.name}/\n`;
        result += getDirectoryTree(path.join(dirPath, entry.name), depth + 1, maxDepth);
      } else {
        result += `${indent}${entry.name}\n`;
      }
    }
  } catch {
    // Permission denied or other error — skip
  }

  return result;
}

function scanProjectContext(projectPath: string): string {
  const sections: string[] = [];

  // 1. Directory structure (3 levels deep)
  const tree = getDirectoryTree(projectPath, 0, 3);
  if (tree) {
    sections.push(`## Project Structure\n\`\`\`\n${tree.trimEnd()}\n\`\`\``);
  }

  // 2. Key config/documentation files
  for (const fileName of CONTEXT_FILES) {
    const filePath = path.join(projectPath, fileName);
    if (fs.existsSync(filePath)) {
      try {
        let content = fs.readFileSync(filePath, 'utf-8');
        // Truncate large files (keep first 3000 chars)
        if (content.length > 3000) {
          content = content.slice(0, 3000) + '\n... (truncated)';
        }
        sections.push(`## ${fileName}\n\`\`\`\n${content.trimEnd()}\n\`\`\``);
      } catch {
        // Skip unreadable files
      }
    }
  }

  // 3. Detect tech stack summary from what was found
  const stack: string[] = [];
  const pkgPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['react']) stack.push('React');
      if (deps['vue']) stack.push('Vue');
      if (deps['angular']) stack.push('Angular');
      if (deps['next']) stack.push('Next.js');
      if (deps['nuxt']) stack.push('Nuxt');
      if (deps['express']) stack.push('Express');
      if (deps['fastify']) stack.push('Fastify');
      if (deps['typescript']) stack.push('TypeScript');
      if (deps['tailwindcss']) stack.push('Tailwind CSS');
      if (deps['prisma']) stack.push('Prisma');
      if (deps['drizzle-orm']) stack.push('Drizzle');
      if (deps['electron']) stack.push('Electron');
      if (deps['vite']) stack.push('Vite');
    } catch { /* skip */ }
  }
  if (fs.existsSync(path.join(projectPath, 'Cargo.toml'))) stack.push('Rust');
  if (fs.existsSync(path.join(projectPath, 'go.mod'))) stack.push('Go');
  if (fs.existsSync(path.join(projectPath, 'pyproject.toml'))) stack.push('Python');

  if (stack.length > 0) {
    sections.unshift(`## Tech Stack\n${stack.join(', ')}`);
  }

  return sections.join('\n\n');
}

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
    const relayDir = path.join(projectPath, '.relay');
    const dbPath = path.join(relayDir, 'relay.db');

    // If .relay/relay.db exists, open the existing project
    if (fs.existsSync(dbPath)) {
      const db = openDb(projectPath);
      const row = db.prepare(`SELECT * FROM projects WHERE path = ? LIMIT 1`).get(projectPath) as Record<string, unknown> | undefined;
      if (row) {
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
      }
    }

    // Otherwise, initialize as a new Relay project
    if (!fs.existsSync(relayDir)) {
      fs.mkdirSync(relayDir, { recursive: true });
    }

    const db = openDb(projectPath);
    const id = randomUUID();
    const now = new Date().toISOString();
    const name = path.basename(projectPath);

    db.prepare(
      `INSERT INTO projects (id, name, path, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)`
    ).run(id, name, projectPath, now, now);

    const project: Project = { id, name, path: projectPath, status: 'active', createdAt: now, updatedAt: now };
    addToRecent(project);
    return project;
  });

  ipcMain.handle('project:list', async (): Promise<RecentProject[]> => {
    return store.get('recentProjects', []) as RecentProject[];
  });

  ipcMain.handle('project:scan', async (_event, projectId: string): Promise<{ status: string; context: string }> => {
    const projects = store.get('recentProjects', []) as RecentProject[];
    for (const p of projects) {
      try {
        const db = openDb(p.path);
        const row = db.prepare('SELECT id, path FROM projects WHERE id = ?').get(projectId) as Record<string, unknown> | undefined;
        if (row) {
          const projectPath = row.path as string;
          const context = scanProjectContext(projectPath);
          db.prepare('UPDATE projects SET context = ?, updated_at = ? WHERE id = ?')
            .run(context, new Date().toISOString(), projectId);
          return { status: 'ok', context };
        }
      } catch {
        continue;
      }
    }
    throw new Error('Project not found');
  });

  ipcMain.handle('project:getContext', async (_event, projectId: string): Promise<string | null> => {
    const projects = store.get('recentProjects', []) as RecentProject[];
    for (const p of projects) {
      try {
        const db = openDb(p.path);
        const row = db.prepare('SELECT context FROM projects WHERE id = ?').get(projectId) as Record<string, unknown> | undefined;
        if (row) return (row.context as string) || null;
      } catch {
        continue;
      }
    }
    return null;
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
