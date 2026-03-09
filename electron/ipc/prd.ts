import { ipcMain, BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { buildPrdPrompt, buildDecomposePrompt, buildClarifyPrompt } from '../agent/prompts';
import { streamText, generateText } from '../agent/runner';
import { openDb } from '../db/connection';
import { store } from './settings';
import { safeStorage } from 'electron';
import { query } from '@anthropic-ai/claude-agent-sdk';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import type { EngineMode } from '../agent/engines/types';
import { DEFAULT_MODEL } from '../../shared/pricing';

let _claudePath: string | undefined;
function getClaudePath(): string {
  if (!_claudePath) {
    try {
      _claudePath = execFileSync('which', ['claude'], { encoding: 'utf-8' }).trim();
    } catch {
      _claudePath = `${os.homedir()}/.local/bin/claude`;
    }
  }
  return _claudePath;
}

function getApiKey(): string {
  const encrypted = store.get('apiKey');
  if (!encrypted) throw new Error('No API key configured. Go to Settings and enter your Anthropic API key.');
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(encrypted as string, 'base64'));
    }
    return encrypted as string;
  } catch {
    store.delete('apiKey');
    throw new Error('Stored API key was corrupted and has been cleared. Please re-enter your API key in Settings.');
  }
}

function getEngineMode(): EngineMode {
  return (store.get('engineMode') ?? 'api-key') as EngineMode;
}

function buildCliEnv(): Record<string, string | undefined> {
  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;
  const homedir = os.homedir();
  const extraPaths = [
    `${homedir}/.local/bin`,
    `${homedir}/.nvm/versions/node/current/bin`,
    '/usr/local/bin',
    '/opt/homebrew/bin',
  ];
  cleanEnv.PATH = [...extraPaths, cleanEnv.PATH ?? ''].join(':');
  return cleanEnv;
}

function getCliQueryOptions(systemPrompt: string, stderrLines: string[]) {
  const selectedModel = (store.get('selectedModel') ?? DEFAULT_MODEL) as string;
  return {
    systemPrompt,
    model: selectedModel,
    cwd: os.homedir(),
    maxTurns: 1,
    allowedTools: [] as string[],
    permissionMode: 'acceptEdits' as const,
    persistSession: false,
    pathToClaudeCodeExecutable: getClaudePath(),
    env: buildCliEnv(),
    debug: true,
    stderr: (data: string) => {
      console.error('[prd:cli:stderr]', data);
      stderrLines.push(data);
    },
  };
}

function sendStatus(win: BrowserWindow, status: string) {
  win.webContents.send('prd:status', { status });
}

async function cliStreamText(
  systemPrompt: string,
  userMessage: string,
  win: BrowserWindow,
  channel: string,
): Promise<string> {
  let fullText = '';
  let hasContent = false;
  const stderrLines: string[] = [];

  sendStatus(win, 'Spawning Claude Code agent...');

  const session = query({
    prompt: userMessage,
    options: getCliQueryOptions(systemPrompt, stderrLines),
  });

  try {
    for await (const message of session) {
      if (message.type === 'system' && 'subtype' in message && message.subtype === 'init') {
        sendStatus(win, 'Agent connected, analyzing request...');
      } else if (message.type === 'stream_event') {
        if (!hasContent) {
          sendStatus(win, 'Writing document...');
          hasContent = true;
        }
        const evt = (message as { event: { type: string; delta?: { type: string; text?: string } } }).event;
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && evt.delta.text) {
          fullText += evt.delta.text;
          win.webContents.send(channel, { type: 'delta', text: evt.delta.text });
        }
      } else if (message.type === 'assistant') {
        // Fallback: if stream_event didn't fire, extract text from completed message
        if (!hasContent) {
          sendStatus(win, 'Writing document...');
          hasContent = true;
        }
        for (const block of message.message.content) {
          if (block.type === 'text' && !fullText) {
            fullText = block.text;
            win.webContents.send(channel, { type: 'delta', text: block.text });
          }
        }
      } else if (message.type === 'result') {
        sendStatus(win, 'Finalizing...');
      }
    }
  } catch (err) {
    const detail = stderrLines.join('\n');
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${msg}${detail ? `\nCLI stderr: ${detail}` : ''}`);
  }

  sendStatus(win, '');
  win.webContents.send(channel, { type: 'done', text: fullText });
  return fullText;
}

async function cliGenerateText(
  systemPrompt: string,
  userMessage: string,
  win?: BrowserWindow,
): Promise<string> {
  let fullText = '';
  const stderrLines: string[] = [];

  if (win) sendStatus(win, 'Spawning Claude Code agent...');

  const session = query({
    prompt: userMessage,
    options: getCliQueryOptions(systemPrompt, stderrLines),
  });

  try {
    for await (const message of session) {
      if (win && message.type === 'system' && 'subtype' in message && message.subtype === 'init') {
        sendStatus(win, 'Agent connected, analyzing PRD...');
      } else if (win && message.type === 'stream_event' && !fullText) {
        sendStatus(win, 'Decomposing into tasks...');
      } else if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'text') {
            fullText += block.text;
          }
        }
      } else if (win && message.type === 'result') {
        sendStatus(win, 'Finalizing tasks...');
      }
    }
  } catch (err) {
    const detail = stderrLines.join('\n');
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${msg}${detail ? `\nCLI stderr: ${detail}` : ''}`);
  }

  if (win) sendStatus(win, '');
  return fullText;
}

export function registerPrdHandlers(): void {
  ipcMain.handle('prd:clarify', async (_event, description: string, projectContext?: string) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) throw new Error('No active window');

    const prompt = buildClarifyPrompt(description, projectContext ?? undefined);
    const systemPrompt = 'You are a senior product manager. Return only valid JSON.';

    let result: string;
    if (getEngineMode() === 'claude-code') {
      result = await cliGenerateText(systemPrompt, prompt, win);
    } else {
      const apiKey = getApiKey();
      result = await generateText(apiKey, systemPrompt, prompt);
    }
    return { status: 'ok', text: result };
  });

  ipcMain.handle('prd:generate', async (_event, description: string, clarifications?: string, projectContext?: string) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) throw new Error('No active window');

    const prompt = buildPrdPrompt(description, clarifications, projectContext ?? undefined);

    if (getEngineMode() === 'claude-code') {
      await cliStreamText('You are a senior product manager.', prompt, win, 'prd:stream');
    } else {
      const apiKey = getApiKey();
      await streamText(apiKey, 'You are a senior product manager.', prompt, win, 'prd:stream');
    }
    return { status: 'ok' };
  });

  ipcMain.handle('prd:decompose', async (_event, prdMarkdown: string, projectContext?: string) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) throw new Error('No active window');

    const prompt = buildDecomposePrompt(prdMarkdown, projectContext ?? undefined);

    if (getEngineMode() === 'claude-code') {
      const result = await cliGenerateText('You are a senior software architect. Return only valid JSON.', prompt, win);
      win.webContents.send('prd:decomposeStream', { type: 'done', text: result });
    } else {
      const apiKey = getApiKey();
      const result = await generateText(apiKey, 'You are a senior software architect. Return only valid JSON.', prompt);
      win.webContents.send('prd:decomposeStream', { type: 'done', text: result });
    }
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

  ipcMain.handle('prd:list', async (_event, projectId: string) => {
    const projects = store.get('recentProjects', []) as Array<{ path: string }>;
    for (const p of projects) {
      try {
        const db = openDb(p.path);
        const projRow = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
        if (!projRow) continue;

        const rows = db.prepare(
          `SELECT p.*,
            (SELECT COUNT(*) FROM tasks t WHERE t.prd_id = p.id) as task_count,
            (SELECT COUNT(*) FROM tasks t WHERE t.prd_id = p.id AND t.status IN ('done', 'approved')) as done_count
           FROM prd p WHERE p.project_id = ? ORDER BY p.created_at DESC`
        ).all(projectId) as Record<string, unknown>[];

        return rows.map(row => ({
          id: row.id,
          projectId: row.project_id,
          description: row.description,
          markdown: row.markdown,
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          taskCount: row.task_count as number,
          doneCount: row.done_count as number,
        }));
      } catch {
        continue;
      }
    }
    return [];
  });

  ipcMain.handle('prd:delete', async (_event, prdId: string) => {
    const projects = store.get('recentProjects', []) as Array<{ path: string }>;
    for (const p of projects) {
      try {
        const db = openDb(p.path);
        const row = db.prepare('SELECT id FROM prd WHERE id = ?').get(prdId);
        if (!row) continue;

        db.prepare(
          `DELETE FROM task_metrics WHERE task_id IN (SELECT id FROM tasks WHERE prd_id = ?)`
        ).run(prdId);
        db.prepare(
          `DELETE FROM task_logs WHERE task_id IN (SELECT id FROM tasks WHERE prd_id = ?)`
        ).run(prdId);
        db.prepare('DELETE FROM tasks WHERE prd_id = ?').run(prdId);
        db.prepare('DELETE FROM prd WHERE id = ?').run(prdId);

        return { status: 'ok' };
      } catch {
        continue;
      }
    }
    throw new Error('PRD not found');
  });
}
