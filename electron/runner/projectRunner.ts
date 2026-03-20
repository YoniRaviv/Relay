import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow } from 'electron';

let runningProcess: ChildProcess | null = null;

interface RunCommand {
  command: string;
  args: string[];
  label: string;
}

export function detectRunCommand(projectPath: string): RunCommand | null {
  // 1. Check user override
  const overridePath = path.join(projectPath, '.relay', 'run.json');
  if (fs.existsSync(overridePath)) {
    try {
      const override = JSON.parse(fs.readFileSync(overridePath, 'utf-8'));
      if (override.command) {
        return { command: override.command, args: override.args || [], label: override.label || override.command };
      }
    } catch { /* ignore */ }
  }

  // 2. package.json
  const pkgPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.scripts?.dev) return { command: 'npm', args: ['run', 'dev'], label: 'npm run dev' };
      if (pkg.scripts?.start) return { command: 'npm', args: ['start'], label: 'npm start' };
    } catch { /* ignore */ }
  }

  // 3. Cargo.toml
  if (fs.existsSync(path.join(projectPath, 'Cargo.toml'))) {
    return { command: 'cargo', args: ['run'], label: 'cargo run' };
  }

  // 4. pyproject.toml
  if (fs.existsSync(path.join(projectPath, 'pyproject.toml'))) {
    try {
      const content = fs.readFileSync(path.join(projectPath, 'pyproject.toml'), 'utf-8');
      if (content.includes('django')) return { command: 'python', args: ['manage.py', 'runserver'], label: 'django runserver' };
      if (content.includes('fastapi')) return { command: 'uvicorn', args: ['main:app', '--reload'], label: 'uvicorn' };
      if (content.includes('flask')) return { command: 'flask', args: ['run'], label: 'flask run' };
    } catch { /* ignore */ }
    return { command: 'python', args: ['-m', 'pytest'], label: 'python' };
  }

  // 5. go.mod
  if (fs.existsSync(path.join(projectPath, 'go.mod'))) {
    return { command: 'go', args: ['run', '.'], label: 'go run .' };
  }

  // 6. docker-compose
  if (fs.existsSync(path.join(projectPath, 'docker-compose.yml')) || fs.existsSync(path.join(projectPath, 'docker-compose.yaml'))) {
    return { command: 'docker', args: ['compose', 'up'], label: 'docker compose up' };
  }

  // 7. Makefile
  const makefilePath = path.join(projectPath, 'Makefile');
  if (fs.existsSync(makefilePath)) {
    try {
      const content = fs.readFileSync(makefilePath, 'utf-8');
      if (content.includes('dev:')) return { command: 'make', args: ['dev'], label: 'make dev' };
      if (content.includes('run:')) return { command: 'make', args: ['run'], label: 'make run' };
    } catch { /* ignore */ }
  }

  return null;
}

export function startProject(projectPath: string, command: string, args: string[], win: BrowserWindow): void {
  if (runningProcess) {
    stopProject();
  }

  const proc = spawn(command, args, {
    cwd: projectPath,
    shell: true,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  runningProcess = proc;

  proc.stdout?.on('data', (data: Buffer) => {
    try {
      if (!win.isDestroyed()) win.webContents.send('project:stdout', data.toString());
    } catch { /* suppress */ }
  });

  proc.stderr?.on('data', (data: Buffer) => {
    try {
      if (!win.isDestroyed()) win.webContents.send('project:stderr', data.toString());
    } catch { /* suppress */ }
  });

  proc.on('exit', (code, signal) => {
    runningProcess = null;
    try {
      if (!win.isDestroyed()) win.webContents.send('project:processExit', { code, signal });
    } catch { /* suppress */ }
  });
}

export function stopProject(): void {
  if (!runningProcess) return;
  const proc = runningProcess;
  runningProcess = null;

  proc.kill('SIGTERM');
  const forceKill = setTimeout(() => {
    try { proc.kill('SIGKILL'); } catch { /* already dead */ }
  }, 5000);

  proc.on('exit', () => clearTimeout(forceKill));
}

export function isProjectRunning(): boolean {
  return runningProcess !== null && !runningProcess.killed;
}
