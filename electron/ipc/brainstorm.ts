import { ipcMain, BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { buildBrainstormSystemPrompt, buildBrainstormFinalizePrompt, buildContentBlocks } from '../agent/prompts';
import { getClient } from '../agent/runner';
import { store } from './settings';
import { safeStorage } from 'electron';
import { openDb } from '../db/connection';
import { DEFAULT_MODEL } from '../../shared/pricing';
import type { ImageAttachment, BrainstormBlock } from '../../shared/types';
import type { EngineMode } from '../agent/engines/types';
import { query } from '@anthropic-ai/claude-agent-sdk';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { withSentry } from './withSentry';

// ── Shared utilities (mirrors prd.ts patterns) ──

function getApiKey(): string {
  const encrypted = store.get('apiKey');
  if (!encrypted) throw new Error('No API key configured. Go to Settings and enter your Anthropic API key.');
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(encrypted as string, 'base64'));
    }
    return encrypted as string;
  } catch {
    throw new Error('Failed to decrypt API key. If this persists, re-enter your key in Settings.');
  }
}

function getEngineMode(): EngineMode {
  return (store.get('engineMode') ?? 'claude-code') as EngineMode;
}

function getModel(): string {
  return (store.get('selectedModel') ?? DEFAULT_MODEL) as string;
}

function getProjectPathById(projectId?: string): string | null {
  if (!projectId) return null;
  const projects = store.get('recentProjects', []) as Array<{ path: string }>;
  for (const p of projects) {
    try {
      const db = openDb(p.path);
      const row = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
      if (row) return p.path;
    } catch { continue; }
  }
  return null;
}

function resolveFileReferences(text: string, projectPath: string): string {
  const regex = /@([\w./\-()[\]{}]+\.\w+)/g;
  const matches = [...text.matchAll(regex)];
  if (matches.length === 0) return '';

  const MAX_PER_FILE = 30 * 1024;
  const MAX_TOTAL = 100 * 1024;
  let totalSize = 0;
  const sections: string[] = [];

  for (const match of matches) {
    const relPath = match[1];
    const absPath = path.resolve(projectPath, relPath);
    if (!absPath.startsWith(projectPath + path.sep)) continue;

    try {
      const stat = fs.statSync(absPath);
      if (!stat.isFile()) continue;
      if (stat.size > MAX_PER_FILE) {
        sections.push(`### ${relPath}\n(File too large: ${Math.round(stat.size / 1024)}KB, limit ${MAX_PER_FILE / 1024}KB)`);
        continue;
      }
      if (totalSize + stat.size > MAX_TOTAL) {
        sections.push(`### ${relPath}\n(Skipped: total referenced file size would exceed ${MAX_TOTAL / 1024}KB)`);
        continue;
      }
      const content = fs.readFileSync(absPath, 'utf-8');
      totalSize += content.length;
      sections.push(`### ${relPath}\n\`\`\`\n${content}\n\`\`\``);
    } catch {
      // File not found or not readable
    }
  }

  if (sections.length === 0) return '';
  return `\n\n## Referenced Files\n${sections.join('\n\n')}`;
}

function safeSend(win: BrowserWindow, channel: string, ...args: unknown[]): void {
  try {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  } catch { /* suppress */ }
}

// ── Session management ──

interface BrainstormSession {
  messages: Anthropic.MessageParam[];
  systemPrompt: string;
  projectPath: string | null;
}

const sessions = new Map<string, BrainstormSession>();

// ── CLI helpers ──

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

// ── JSON parsing ──

const VALID_BLOCK_TYPES = new Set(['question', 'approaches', 'design-section', 'ready']);

function parseBrainstormBlock(text: string): BrainstormBlock | null {
  const tryParse = (s: string): BrainstormBlock | null => {
    try {
      const parsed = JSON.parse(s);
      if (parsed && typeof parsed.type === 'string' && VALID_BLOCK_TYPES.has(parsed.type)) {
        return parsed as BrainstormBlock;
      }
    } catch { /* not valid JSON */ }
    return null;
  };

  // Try direct parse
  const direct = tryParse(text.trim());
  if (direct) return direct;

  // Try extracting JSON object from surrounding text / code fences
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const extracted = tryParse(jsonMatch[0]);
    if (extracted) return extracted;
  }

  return null;
}

// ── Non-streaming generation (for conversation turns) ──

async function generateWithSdk(session: BrainstormSession): Promise<string> {
  const apiKey = getApiKey();
  const anthropic = getClient(apiKey);

  const message = await anthropic.messages.create({
    model: getModel(),
    max_tokens: 4096,
    system: session.systemPrompt,
    messages: session.messages,
  });

  const block = message.content[0];
  return block.type === 'text' ? block.text : '';
}

async function generateWithCli(session: BrainstormSession): Promise<string> {
  // Serialize conversation history into a single prompt for CLI mode
  const historyText = session.messages.map(m => {
    const role = m.role === 'user' ? 'User' : 'Assistant';
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    return `${role}: ${content}`;
  }).join('\n\n');

  const fullPrompt = `${session.systemPrompt}\n\n## Conversation so far\n${historyText}\n\nAssistant:`;
  const textChunks: string[] = [];
  const stderrLines: string[] = [];

  const cliSession = query({
    prompt: fullPrompt,
    options: {
      systemPrompt: session.systemPrompt,
      model: getModel(),
      cwd: session.projectPath ?? os.homedir(),
      maxTurns: 1,
      allowedTools: [] as string[],
      permissionMode: 'acceptEdits' as const,
      persistSession: false,
      pathToClaudeCodeExecutable: getClaudePath(),
      env: buildCliEnv(),
      stderr: (data: string) => { stderrLines.push(data); },
    },
  });

  try {
    for await (const message of cliSession) {
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'text') {
            textChunks.push(block.text);
          }
        }
      }
    }
  } catch (err) {
    const detail = stderrLines.join('\n');
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${msg}${detail ? `\nCLI stderr: ${detail}` : ''}`);
  }

  return textChunks.join('');
}

async function generateResponse(session: BrainstormSession): Promise<string> {
  const engine = getEngineMode();
  if (engine === 'api-key') {
    return generateWithSdk(session);
  }
  return generateWithCli(session);
}

// ── Streaming (only for finalize) ──

async function streamWithSdk(
  session: BrainstormSession,
  win: BrowserWindow,
  channel: string,
): Promise<string> {
  const apiKey = getApiKey();
  const anthropic = getClient(apiKey);
  let fullText = '';

  const stream = anthropic.messages.stream({
    model: getModel(),
    max_tokens: 8192,
    system: session.systemPrompt,
    messages: session.messages,
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      fullText += event.delta.text;
      safeSend(win, channel, { type: 'finalize-delta', text: event.delta.text });
    }
  }

  safeSend(win, channel, { type: 'finalize-done', text: fullText });
  return fullText;
}

async function streamWithCli(
  session: BrainstormSession,
  win: BrowserWindow,
  channel: string,
): Promise<string> {
  const historyText = session.messages.map(m => {
    const role = m.role === 'user' ? 'User' : 'Assistant';
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    return `${role}: ${content}`;
  }).join('\n\n');

  const fullPrompt = `${session.systemPrompt}\n\n## Conversation so far\n${historyText}\n\nAssistant:`;
  const textChunks: string[] = [];
  const stderrLines: string[] = [];

  const cliSession = query({
    prompt: fullPrompt,
    options: {
      systemPrompt: session.systemPrompt,
      model: getModel(),
      cwd: session.projectPath ?? os.homedir(),
      maxTurns: 1,
      allowedTools: [] as string[],
      permissionMode: 'acceptEdits' as const,
      persistSession: false,
      pathToClaudeCodeExecutable: getClaudePath(),
      env: buildCliEnv(),
      stderr: (data: string) => { stderrLines.push(data); },
    },
  });

  try {
    for await (const message of cliSession) {
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'text') {
            textChunks.push(block.text);
            safeSend(win, channel, { type: 'finalize-delta', text: block.text });
          }
        }
      }
    }
  } catch (err) {
    const detail = stderrLines.join('\n');
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${msg}${detail ? `\nCLI stderr: ${detail}` : ''}`);
  }

  const fullText = textChunks.join('');
  safeSend(win, channel, { type: 'finalize-done', text: fullText });
  return fullText;
}

async function streamFinalize(
  session: BrainstormSession,
  win: BrowserWindow,
  channel: string,
): Promise<string> {
  const engine = getEngineMode();
  if (engine === 'api-key') {
    return streamWithSdk(session, win, channel);
  }
  return streamWithCli(session, win, channel);
}

// ── IPC Handlers ──

export function registerBrainstormHandlers(): void {
  ipcMain.handle('brainstorm:start', withSentry('brainstorm:start', async (
    _event,
    projectId: string,
    description: string,
    projectContext?: string,
    attachments?: ImageAttachment[],
  ) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) throw new Error('No active window');

    const projectPath = getProjectPathById(projectId);
    const fileContext = projectPath ? resolveFileReferences(description, projectPath) : '';
    const enrichedDescription = description + fileContext;
    const systemPrompt = buildBrainstormSystemPrompt(projectContext ?? undefined);

    const sessionId = randomUUID();
    const hasAttachments = !!attachments?.length;
    const userContent = buildContentBlocks(
      `I want to build the following feature. Help me brainstorm and design it.\n\n## Feature Description\n${enrichedDescription}`,
      hasAttachments ? attachments : undefined,
    );

    const session: BrainstormSession = {
      messages: [{ role: 'user', content: userContent }],
      systemPrompt,
      projectPath,
    };
    sessions.set(sessionId, session);

    // Signal thinking state
    safeSend(win, 'brainstorm:message', { type: 'thinking' });

    try {
      const response = await generateResponse(session);
      session.messages.push({ role: 'assistant', content: response });

      const block = parseBrainstormBlock(response);
      if (block) {
        safeSend(win, 'brainstorm:message', { type: 'block', block, rawText: response });
      } else {
        safeSend(win, 'brainstorm:message', { type: 'fallback', text: response });
      }
    } catch (err) {
      sessions.delete(sessionId);
      safeSend(win, 'brainstorm:message', { type: 'error', text: err instanceof Error ? err.message : 'Brainstorm failed' });
      throw err;
    }

    return { status: 'ok', sessionId };
  }));

  ipcMain.handle('brainstorm:respond', withSentry('brainstorm:respond', async (
    _event,
    sessionId: string,
    userMessage: string,
  ) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) throw new Error('No active window');

    const session = sessions.get(sessionId);
    if (!session) throw new Error('Brainstorm session not found. It may have expired.');

    session.messages.push({ role: 'user', content: userMessage });

    // Signal thinking state
    safeSend(win, 'brainstorm:message', { type: 'thinking' });

    try {
      const response = await generateResponse(session);
      session.messages.push({ role: 'assistant', content: response });

      const block = parseBrainstormBlock(response);
      if (block) {
        safeSend(win, 'brainstorm:message', { type: 'block', block, rawText: response });
      } else {
        safeSend(win, 'brainstorm:message', { type: 'fallback', text: response });
      }
    } catch (err) {
      // Remove the failed user message so session stays consistent
      session.messages.pop();
      safeSend(win, 'brainstorm:message', { type: 'error', text: err instanceof Error ? err.message : 'Failed to get response' });
      throw err;
    }

    return { status: 'ok' };
  }));

  ipcMain.handle('brainstorm:finalize', withSentry('brainstorm:finalize', async (
    _event,
    sessionId: string,
  ) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) throw new Error('No active window');

    const session = sessions.get(sessionId);
    if (!session) throw new Error('Brainstorm session not found. It may have expired.');

    // Append the finalize instruction
    session.messages.push({ role: 'user', content: buildBrainstormFinalizePrompt() });

    try {
      const response = await streamFinalize(session, win, 'brainstorm:stream');
      session.messages.push({ role: 'assistant', content: response });
      // Clean up session after finalization
      sessions.delete(sessionId);
    } catch (err) {
      session.messages.pop();
      safeSend(win, 'brainstorm:stream', { type: 'error', text: err instanceof Error ? err.message : 'Failed to finalize design' });
      throw err;
    }

    return { status: 'ok' };
  }));

  ipcMain.handle('brainstorm:cleanup', async (_event, sessionId: string) => {
    sessions.delete(sessionId);
    return { status: 'ok' };
  });
}
