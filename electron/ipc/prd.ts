import { ipcMain, BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { buildPrdPrompt, buildDecomposePrompt, buildClarifyPrompt, buildContentBlocks } from '../agent/prompts';
import type { ContentBlock } from '../agent/prompts';
import { streamText, generateText } from '../agent/runner';
import { streamText as openaiStreamText, generateText as openaiGenerateText } from '../agent/openaiRunner';
import type { ImageAttachment } from '../../shared/types';
import { openDb } from '../db/connection';
import { store } from './settings';
import { safeStorage } from 'electron';
import { query } from '@anthropic-ai/claude-agent-sdk';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { EngineMode } from '../agent/engines/types';
import { DEFAULT_MODEL } from '../../shared/pricing';
import { app } from 'electron';
import { withSentry } from './withSentry';

const isDev = !app.isPackaged;

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
  } catch (err) {
    console.error('[prd] API key decryption failed:', err);
    throw new Error('Failed to decrypt API key. If this persists, re-enter your key in Settings.');
  }
}

function getEngineMode(): EngineMode {
  return (store.get('engineMode') ?? 'claude-code') as EngineMode;
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

function getCliQueryOptions(systemPrompt: string, stderrLines: string[], projectPath?: string | null, maxTurnsOverride?: number) {
  const selectedModel = (store.get('selectedModel') ?? DEFAULT_MODEL) as string;
  const hasProjectPath = !!projectPath;
  return {
    systemPrompt,
    model: selectedModel,
    cwd: projectPath ?? os.homedir(),
    maxTurns: maxTurnsOverride ?? (hasProjectPath ? 15 : 1),
    allowedTools: hasProjectPath ? ['Read', 'Glob', 'Grep'] : ([] as string[]),
    permissionMode: 'acceptEdits' as const,
    persistSession: false,
    pathToClaudeCodeExecutable: getClaudePath(),
    env: buildCliEnv(),
    debug: isDev,
    stderr: (data: string) => {
      console.error('[prd:cli:stderr]', data);
      stderrLines.push(data);
    },
  };
}

async function* toPromptIterable(content: ContentBlock[]): AsyncIterable<import('@anthropic-ai/claude-agent-sdk').SDKUserMessage> {
  yield {
    type: 'user' as const,
    message: { role: 'user' as const, content } as import('@anthropic-ai/sdk/resources').MessageParam,
    parent_tool_use_id: null,
    session_id: '',
  };
}

function sendStatus(win: BrowserWindow, status: string) {
  win.webContents.send('prd:status', { status });
}

async function cliStreamText(
  systemPrompt: string,
  userMessage: string | ContentBlock[],
  win: BrowserWindow,
  channel: string,
  projectPath?: string | null,
  maxTurnsOverride?: number,
): Promise<string> {
  const textChunks: string[] = [];
  let hasContent = false;
  let documentStarted = false; // Track when actual document content begins
  const stderrLines: string[] = [];

  sendStatus(win, 'Spawning Claude Code agent...');

  const prompt = typeof userMessage === 'string'
    ? userMessage
    : toPromptIterable(userMessage);

  const session = query({
    prompt,
    options: getCliQueryOptions(systemPrompt, stderrLines, projectPath, maxTurnsOverride),
  });

  try {
    for await (const message of session) {
      if (message.type === 'system' && 'subtype' in message && message.subtype === 'init') {
        sendStatus(win, 'Agent connected, analyzing request...');
      } else if (message.type === 'stream_event') {
        const evt = (message as { event: { type: string; delta?: { type: string; text?: string } } }).event;
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && evt.delta.text) {
          const text = evt.delta.text;
          // When project context is enabled, the agent may "think aloud" before writing.
          // Only start streaming to UI once we see markdown document content (# heading).
          if (!documentStarted) {
            textChunks.push(text);
            const accumulated = textChunks.join('');
            if (accumulated.includes('# ')) {
              documentStarted = true;
              // Strip preamble — only keep text from the first heading onward
              const headingIndex = accumulated.indexOf('# ');
              const documentText = accumulated.substring(headingIndex);
              textChunks.length = 0;
              textChunks.push(documentText);
              if (!hasContent) { sendStatus(win, 'Writing document...'); hasContent = true; }
              win.webContents.send(channel, { type: 'delta', text: documentText });
            }
          } else {
            textChunks.push(text);
            win.webContents.send(channel, { type: 'delta', text });
          }
        }
      } else if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'text') {
            if (!documentStarted) {
              // Check if this completed message contains the document
              if (block.text.includes('# ')) {
                documentStarted = true;
                const headingIndex = block.text.indexOf('# ');
                const documentText = block.text.substring(headingIndex);
                if (!hasContent) { sendStatus(win, 'Writing document...'); hasContent = true; }
                if (textChunks.length === 0) {
                  textChunks.push(documentText);
                  win.webContents.send(channel, { type: 'delta', text: documentText });
                }
              }
              // Skip non-document text (agent narration during tool use)
            } else if (textChunks.length === 0) {
              textChunks.push(block.text);
              win.webContents.send(channel, { type: 'delta', text: block.text });
            }
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

  const fullText = textChunks.join('');
  sendStatus(win, '');

  // Validate: if the agent used all turns exploring but never wrote a proper document,
  // signal failure so the frontend can show an error instead of an empty review page.
  if (!documentStarted && fullText.length < 200) {
    win.webContents.send(channel, { type: 'error', text: 'The agent explored the project but did not produce a specification document. Try again — the agent will use its findings from this attempt.' });
  } else {
    // If document never formally started but we have substantial text, send it anyway
    win.webContents.send(channel, { type: 'done', text: fullText });
  }
  return fullText;
}

async function cliGenerateText(
  systemPrompt: string,
  userMessage: string | ContentBlock[],
  win?: BrowserWindow,
  projectPath?: string | null,
  maxTurnsOverride?: number,
): Promise<string> {
  const textChunks: string[] = [];
  const stderrLines: string[] = [];

  if (win) sendStatus(win, 'Spawning Claude Code agent...');

  const prompt = typeof userMessage === 'string'
    ? userMessage
    : toPromptIterable(userMessage);

  const session = query({
    prompt,
    options: getCliQueryOptions(systemPrompt, stderrLines, projectPath, maxTurnsOverride),
  });

  try {
    for await (const message of session) {
      if (win && message.type === 'system' && 'subtype' in message && message.subtype === 'init') {
        sendStatus(win, 'Agent connected, analyzing PRD...');
      } else if (win && message.type === 'stream_event' && textChunks.length === 0) {
        sendStatus(win, 'Decomposing into tasks...');
      } else if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'text') {
            textChunks.push(block.text);
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
  return textChunks.join('');
}

export function registerPrdHandlers(): void {
  ipcMain.handle('prd:clarify', async (_event, projectId: string, description: string, projectContext?: string, attachments?: ImageAttachment[]) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) throw new Error('No active window');

    const projectPath = getProjectPathById(projectId);
    const fileContext = projectPath ? resolveFileReferences(description, projectPath) : '';
    const enrichedDescription = description + fileContext;
    const hasAttachments = !!attachments?.length;
    const prompt = buildClarifyPrompt(enrichedDescription, projectContext ?? undefined, hasAttachments);
    const systemPrompt = projectPath
      ? 'You are a senior product manager. When signing or attributing the document, use the author name "Relay Studio Agent". You have access to the project directory — use tools silently to understand the codebase. Do NOT narrate your exploration. Return only valid JSON.'
      : 'You are a senior product manager. When signing or attributing the document, use the author name "Relay Studio Agent". Return only valid JSON.';
    const contentBlocks = buildContentBlocks(prompt, attachments);

    if (hasAttachments) sendStatus(win, `Analyzing ${attachments!.length} attached image${attachments!.length > 1 ? 's' : ''}...`);

    let result: string;
    if (getEngineMode() === 'claude-code') {
      // Clarify doesn't need deep exploration — cap at 5 turns (enough for a quick codebase peek)
      result = await cliGenerateText(systemPrompt, contentBlocks, win, projectPath, 5);
    } else if (getEngineMode() === 'codex') {
      const textPrompt = typeof contentBlocks === 'string' ? contentBlocks : prompt;
      result = await openaiGenerateText(systemPrompt, textPrompt);
    } else {
      const apiKey = getApiKey();
      result = await generateText(apiKey, systemPrompt, contentBlocks);
    }
    return { status: 'ok', text: result };
  });

  ipcMain.handle('prd:generate', withSentry('prd:generate', async (_event, projectId: string, description: string, clarifications?: string, projectContext?: string, attachments?: ImageAttachment[]) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) throw new Error('No active window');

    const projectPath = getProjectPathById(projectId);
    const fileContext = projectPath ? resolveFileReferences(description, projectPath) : '';
    const enrichedDescription = description + fileContext;
    const hasAttachments = !!attachments?.length;
    const prompt = buildPrdPrompt(enrichedDescription, clarifications, projectContext ?? undefined, hasAttachments);
    const contentBlocks = buildContentBlocks(prompt, attachments);

    if (hasAttachments) sendStatus(win, `Analyzing ${attachments!.length} attached image${attachments!.length > 1 ? 's' : ''}...`);

    if (getEngineMode() === 'claude-code') {
      const cliSystemPrompt = projectPath
        ? 'You are a senior product manager. When signing or attributing the document, use the author name "Relay Studio Agent". You have access to the project directory — use Read/Glob/Grep tools to understand the codebase before writing. IMPORTANT: Do NOT narrate your exploration. Do NOT say "Let me look at..." or describe what you are doing. Use tools silently, then output ONLY the final specification document in markdown. Your entire text response must be the specification — no preamble, no commentary.'
        : 'You are a senior product manager. When signing or attributing the document, use the author name "Relay Studio Agent".';
      await cliStreamText(cliSystemPrompt, contentBlocks, win, 'prd:stream', projectPath);
    } else if (getEngineMode() === 'codex') {
      const textPrompt = typeof contentBlocks === 'string' ? contentBlocks : prompt;
      await openaiStreamText('You are a senior product manager. When signing or attributing the document, use the author name "Relay Studio Agent".', textPrompt, win, 'prd:stream');
    } else {
      const apiKey = getApiKey();
      await streamText(apiKey, 'You are a senior product manager. When signing or attributing the document, use the author name "Relay Studio Agent".', contentBlocks, win, 'prd:stream');
    }
    return { status: 'ok' };
  }));

  ipcMain.handle('prd:decompose', withSentry('prd:decompose', async (_event, projectId: string, prdMarkdown: string, _projectContext?: string) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) throw new Error('No active window');

    const projectPath = getProjectPathById(projectId);
    // Skip redundant projectContext — it's already encoded in the PRD markdown.
    const prompt = buildDecomposePrompt(prdMarkdown);

    if (getEngineMode() === 'claude-code') {
      const result = await cliGenerateText('You are a senior software architect. Return only valid JSON.', prompt, win, projectPath);
      win.webContents.send('prd:decomposeStream', { type: 'done', text: result });
    } else if (getEngineMode() === 'codex') {
      const result = await openaiGenerateText('You are a senior software architect. Return only valid JSON.', prompt);
      win.webContents.send('prd:decomposeStream', { type: 'done', text: result });
    } else {
      const apiKey = getApiKey();
      const result = await generateText(apiKey, 'You are a senior software architect. Return only valid JSON.', prompt);
      win.webContents.send('prd:decomposeStream', { type: 'done', text: result });
    }
    return { status: 'ok' };
  }));

  ipcMain.handle('prd:save', async (_event, data: {
    projectId: string;
    description: string;
    markdown: string;
    title?: string;
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

    const insertPrd = db.prepare(
      `INSERT INTO prd (id, project_id, description, markdown, title, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'approved', ?, ?)`
    );

    const insertTask = db.prepare(
      `INSERT INTO tasks (id, project_id, prd_id, story_id, title, description, acceptance_criteria, priority, status, "order", passes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 0, ?, ?)`
    );

    // Wrap PRD + all tasks in a single transaction to prevent orphaned PRDs on crash
    const saveAll = db.transaction(() => {
      insertPrd.run(prdId, data.projectId, data.description, data.markdown, data.title ?? null, now, now);
      data.tasks.forEach((task, i) => {
        insertTask.run(
          randomUUID(), data.projectId, prdId, task.storyId,
          task.title, task.description, task.acceptanceCriteria,
          task.priority, i, now, now
        );
      });
    });

    saveAll();
    return { status: 'ok', prdId };
  });

  ipcMain.handle('prd:rename', async (_event, prdId: string, title: string) => {
    const projects = store.get('recentProjects', []) as Array<{ path: string }>;
    for (const p of projects) {
      try {
        const db = openDb(p.path);
        const row = db.prepare('SELECT id FROM prd WHERE id = ?').get(prdId);
        if (!row) continue;
        db.prepare('UPDATE prd SET title = ?, updated_at = ? WHERE id = ?')
          .run(title, new Date().toISOString(), prdId);
        return { status: 'ok' };
      } catch { continue; }
    }
    throw new Error('PRD not found');
  });

  ipcMain.handle('prd:get', async (_event, projectId: string) => {
    const projects = store.get('recentProjects', []) as Array<{ path: string }>;
    const errors: string[] = [];
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
            title: row.title ?? null,
            description: row.description,
            markdown: row.markdown,
            status: row.status,
            featureBranch: row.feature_branch ?? null,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          };
        }
      } catch (err) {
        errors.push(`${p.path}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
    }
    if (errors.length > 0) {
      console.error('[prd:get] DB errors encountered:', errors.join('; '));
    }
    return null;
  });

  ipcMain.handle('prd:list', async (_event, projectId: string) => {
    const projects = store.get('recentProjects', []) as Array<{ path: string }>;
    const errors: string[] = [];
    for (const p of projects) {
      try {
        const db = openDb(p.path);
        const projRow = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
        if (!projRow) continue;

        const rows = db.prepare(
          `SELECT p.*,
            (SELECT COUNT(*) FROM tasks t WHERE t.prd_id = p.id) as task_count,
            (SELECT COUNT(*) FROM tasks t WHERE t.prd_id = p.id AND t.status = 'done') as done_count
           FROM prd p WHERE p.project_id = ? AND p.is_archived = 0 ORDER BY p.created_at DESC`
        ).all(projectId) as Record<string, unknown>[];

        return rows.map(row => ({
          id: row.id,
          projectId: row.project_id,
          title: row.title ?? null,
          description: row.description,
          markdown: row.markdown,
          status: row.status,
          isArchived: !!(row.is_archived),
          featureBranch: row.feature_branch ?? null,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          taskCount: row.task_count as number,
          doneCount: row.done_count as number,
        }));
      } catch (err) {
        errors.push(`${p.path}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
    }
    if (errors.length > 0) {
      console.error('[prd:list] DB errors encountered:', errors.join('; '));
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

  ipcMain.handle('prd:setFeatureBranch', async (_event, prdId: string, branch: string) => {
    const projects = store.get('recentProjects', []) as Array<{ path: string }>;
    for (const p of projects) {
      try {
        const db = openDb(p.path);
        const row = db.prepare('SELECT id FROM prd WHERE id = ?').get(prdId);
        if (!row) continue;

        db.prepare('UPDATE prd SET feature_branch = ?, updated_at = ? WHERE id = ?')
          .run(branch, new Date().toISOString(), prdId);
        return { status: 'ok' };
      } catch {
        continue;
      }
    }
    throw new Error('PRD not found');
  });

  // Archive / Unarchive
  ipcMain.handle('prd:archive', async (_event, prdId: string) => {
    const projects = store.get('recentProjects', []) as Array<{ path: string }>;
    for (const p of projects) {
      try {
        const db = openDb(p.path);
        const row = db.prepare('SELECT id FROM prd WHERE id = ?').get(prdId);
        if (!row) continue;
        db.prepare('UPDATE prd SET is_archived = 1, updated_at = ? WHERE id = ?')
          .run(new Date().toISOString(), prdId);
        return { status: 'ok' };
      } catch { continue; }
    }
    throw new Error('PRD not found');
  });

  ipcMain.handle('prd:unarchive', async (_event, prdId: string) => {
    const projects = store.get('recentProjects', []) as Array<{ path: string }>;
    for (const p of projects) {
      try {
        const db = openDb(p.path);
        const row = db.prepare('SELECT id FROM prd WHERE id = ?').get(prdId);
        if (!row) continue;
        db.prepare('UPDATE prd SET is_archived = 0, updated_at = ? WHERE id = ?')
          .run(new Date().toISOString(), prdId);
        return { status: 'ok' };
      } catch { continue; }
    }
    throw new Error('PRD not found');
  });

  ipcMain.handle('prd:listArchived', async (_event, projectId: string) => {
    const projects = store.get('recentProjects', []) as Array<{ path: string }>;
    for (const p of projects) {
      try {
        const db = openDb(p.path);
        const projRow = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
        if (!projRow) continue;

        const rows = db.prepare(
          `SELECT p.*,
            (SELECT COUNT(*) FROM tasks t WHERE t.prd_id = p.id) as task_count,
            (SELECT COUNT(*) FROM tasks t WHERE t.prd_id = p.id AND t.status = 'done') as done_count
           FROM prd p WHERE p.project_id = ? AND p.is_archived = 1 ORDER BY p.updated_at DESC`
        ).all(projectId) as Record<string, unknown>[];

        return rows.map(row => ({
          id: row.id,
          projectId: row.project_id,
          title: row.title ?? null,
          description: row.description,
          markdown: row.markdown,
          status: row.status,
          isArchived: true,
          featureBranch: row.feature_branch ?? null,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          taskCount: row.task_count as number,
          doneCount: row.done_count as number,
        }));
      } catch { continue; }
    }
    return [];
  });

  // #44: Export PRD + tasks as Markdown
  ipcMain.handle('prd:exportMarkdown', async (_event, _projectId: string, prdId: string) => {
    const projects = store.get('recentProjects', []) as Array<{ path: string }>;
    for (const p of projects) {
      try {
        const db = openDb(p.path);
        const prd = db.prepare('SELECT * FROM prd WHERE id = ?').get(prdId) as Record<string, unknown> | undefined;
        if (!prd) continue;

        const tasks = db.prepare(
          `SELECT * FROM tasks WHERE prd_id = ? ORDER BY "order" ASC`
        ).all(prdId) as Record<string, unknown>[];

        let md = `# ${(prd.title as string) || (prd.description as string).split('\n')[0] || 'Feature'}\n\n`;
        md += `${prd.markdown as string}\n\n`;
        md += `---\n\n## Tasks\n\n`;

        const statusEmoji: Record<string, string> = {
          done: '[x]', pending: '[ ]', in_progress: '[-]', review: '[?]', failed: '[!]',
        };

        for (const t of tasks) {
          const emoji = statusEmoji[t.status as string] ?? '[ ]';
          md += `- ${emoji} **${t.story_id}**: ${t.title}\n`;
          if (t.description) md += `  ${(t.description as string).split('\n')[0]}\n`;
        }

        md += `\n---\n*Exported from Relay Studio on ${new Date().toISOString().split('T')[0]}*\n`;
        return { status: 'ok', markdown: md };
      } catch { continue; }
    }
    throw new Error('PRD not found');
  });
}
