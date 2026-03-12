import { ipcMain, BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { buildPrdPrompt, buildDecomposePrompt, buildClarifyPrompt } from '../agent/prompts';
import type { PromptContent } from '../agent/prompts';
import { streamText, generateText } from '../agent/runner';
import { openDb } from '../db/connection';
import { store } from './settings';
import { safeStorage } from 'electron';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import type { EngineMode } from '../agent/engines/types';
import type { Attachment } from '../../shared/types';
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

function getCliQueryOptions(systemPrompt: string, stderrLines: string[], multimodal = false) {
  const selectedModel = (store.get('selectedModel') ?? DEFAULT_MODEL) as string;
  return {
    // In multimodal mode, instructions are embedded in the user message to avoid
    // being overridden by Claude Code's agent system prompt.
    systemPrompt: multimodal ? undefined : systemPrompt,
    model: selectedModel,
    cwd: os.homedir(),
    maxTurns: 1,
    tools: [] as string[],
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

// Check if prompt content has image blocks (requires streaming input mode)
function hasImageBlocks(content: PromptContent): boolean {
  return Array.isArray(content) && content.some(b => b.type === 'image');
}

// Build an AsyncGenerator for streaming input mode (required for image content blocks).
// Embeds the system prompt as a leading text block so it's not overridden by Claude Code's agent prompt.
async function* buildStreamingPrompt(systemPrompt: string, content: PromptContent): AsyncGenerator<SDKUserMessage> {
  // Prepend system role instructions into the user message itself
  const instructionBlock = {
    type: 'text' as const,
    text: `IMPORTANT: ${systemPrompt} Generate your full response directly. Do NOT describe what you will do or plan steps — just produce the requested output.\n\n`,
  };

  const blocks = Array.isArray(content)
    ? [instructionBlock, ...content]
    : [{ type: 'text' as const, text: `${instructionBlock.text}${content}` }];

  yield {
    type: 'user',
    message: { role: 'user', content: blocks },
    parent_tool_use_id: null,
    session_id: randomUUID(),
  } as SDKUserMessage;
}

// Extract plain text from PromptContent (strips image blocks, used for string prompt mode)
function toPlainText(content: PromptContent): string {
  if (typeof content === 'string') return content;
  return content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('\n\n');
}

async function cliStreamText(
  systemPrompt: string,
  promptContent: PromptContent,
  win: BrowserWindow,
  channel: string,
): Promise<string> {
  let fullText = '';
  let hasContent = false;
  const stderrLines: string[] = [];
  const multimodal = hasImageBlocks(promptContent);

  sendStatus(win, 'Spawning Claude Code agent...');

  // String prompt = simple text generation (text-only).
  // AsyncGenerator = streaming input mode with vision content blocks (multimodal).
  const session = query({
    prompt: multimodal
      ? buildStreamingPrompt(systemPrompt, promptContent)
      : toPlainText(promptContent),
    options: getCliQueryOptions(systemPrompt, stderrLines, multimodal),
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
  promptContent: PromptContent,
  win?: BrowserWindow,
): Promise<string> {
  let fullText = '';
  let hasContent = false;
  const stderrLines: string[] = [];
  const multimodal = hasImageBlocks(promptContent);

  if (win) sendStatus(win, 'Spawning Claude Code agent...');

  const session = query({
    prompt: multimodal
      ? buildStreamingPrompt(systemPrompt, promptContent)
      : toPlainText(promptContent),
    options: getCliQueryOptions(systemPrompt, stderrLines, multimodal),
  });

  try {
    for await (const message of session) {
      if (win && message.type === 'system' && 'subtype' in message && message.subtype === 'init') {
        sendStatus(win, 'Agent connected, processing...');
      } else if (message.type === 'stream_event') {
        if (win && !hasContent) {
          sendStatus(win, 'Generating response...');
          hasContent = true;
        }
        const evt = (message as { event: { type: string; delta?: { type: string; text?: string } } }).event;
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && evt.delta.text) {
          fullText += evt.delta.text;
        }
      } else if (message.type === 'assistant') {
        if (!hasContent) hasContent = true;
        for (const block of message.message.content) {
          if (block.type === 'text' && !fullText) {
            fullText = block.text;
          }
        }
      } else if (win && message.type === 'result') {
        sendStatus(win, 'Finalizing...');
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

function getWin(event: Electron.IpcMainInvokeEvent): BrowserWindow {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) throw new Error('No active window');
  return win;
}

export function registerPrdHandlers(): void {
  ipcMain.handle('prd:clarify', async (event, description: string, projectContext?: string, attachments?: Attachment[]) => {
    const win = getWin(event);

    const prompt = buildClarifyPrompt(description, projectContext ?? undefined, attachments);
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

  ipcMain.handle('prd:generate', async (event, description: string, clarifications?: string, projectContext?: string, attachments?: Attachment[]) => {
    const win = getWin(event);

    const prompt = buildPrdPrompt(description, clarifications, projectContext ?? undefined, attachments);

    if (getEngineMode() === 'claude-code') {
      await cliStreamText('You are a senior product manager.', prompt, win, 'prd:stream');
    } else {
      const apiKey = getApiKey();
      await streamText(apiKey, 'You are a senior product manager.', prompt, win, 'prd:stream');
    }
    return { status: 'ok' };
  });

  ipcMain.handle('prd:decompose', async (event, prdMarkdown: string, projectContext?: string) => {
    const win = getWin(event);

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
