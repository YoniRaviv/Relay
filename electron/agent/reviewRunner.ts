import { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import simpleGit from 'simple-git';
import { store } from '../ipc/settings';
import { getDbForProject, getProjectPath } from '../db/projectLookup';
import { detectStack } from './stackDetector';
import { readConventionsFiles, getStackRules, buildAnalyzePrompt, buildFixPrompt } from './reviewPrompts';
import { DEFAULT_MODEL } from '../../shared/pricing';
import type { ReviewFinding, ReviewSession, EngineMode } from '../../shared/types';
import type Anthropic from '@anthropic-ai/sdk';

function safeSend(win: BrowserWindow, channel: string, ...args: unknown[]): void {
  try {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  } catch { /* suppress */ }
}

// ── Abort signal shared across phases ──

let activeAbort: { aborted: boolean } = { aborted: false };

export function cancelReview(): void {
  activeAbort.aborted = true;
}

// ── Context Gathering ──

interface ReviewContext {
  diff: string;
  touchedFiles: Map<string, string>;
  stackProfile: string;
  frameworks: string[];
  conventions: string;
  diffSummary: string;
  headCommit: string;
}

async function gatherContext(projectPath: string, baseBranch: string): Promise<ReviewContext> {
  const git = simpleGit(projectPath);
  const headCommit = (await git.revparse(['HEAD'])).trim();

  let diff: string;
  try {
    diff = await git.diff([`${baseBranch}...HEAD`, '--', '.', ':!.relay/']);
  } catch {
    diff = await git.diff(['HEAD~1', '--', '.', ':!.relay/']);
  }

  // Parse diff to identify touched files
  const touchedFilePaths = new Set<string>();
  const diffLines = diff.split('\n');
  for (const line of diffLines) {
    const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (match) touchedFilePaths.add(match[2]);
  }

  // Read full contents of touched files
  const touchedFiles = new Map<string, string>();
  let totalSize = 0;
  const MAX_TOTAL_SIZE = 100 * 1024;
  const MAX_FILE_SIZE = 30 * 1024;

  for (const filePath of touchedFilePaths) {
    if (totalSize >= MAX_TOTAL_SIZE) break;
    const fullPath = path.join(projectPath, filePath);
    try {
      if (!fs.existsSync(fullPath)) continue;
      const stat = fs.statSync(fullPath);
      if (stat.size > MAX_FILE_SIZE) continue;
      const content = fs.readFileSync(fullPath, 'utf-8');
      touchedFiles.set(filePath, content);
      totalSize += content.length;
    } catch { /* skip unreadable files */ }
  }

  const { profile, frameworks } = detectStack(projectPath);
  const conventions = readConventionsFiles(projectPath);

  const fileCount = touchedFilePaths.size;
  const additions = diffLines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length;
  const deletions = diffLines.filter(l => l.startsWith('-') && !l.startsWith('---')).length;
  const diffSummary = `${fileCount} files, +${additions} -${deletions} lines`;

  return { diff, touchedFiles, stackProfile: profile, frameworks, conventions, diffSummary, headCommit };
}

// ── Engine-specific analyze calls ──

async function analyzeWithSdk(
  prompt: string,
  userMessage: string,
): Promise<{ text: string; tokensIn: number; tokensOut: number; model: string }> {
  const { safeStorage } = await import('electron');
  const { getClient } = await import('./runner');

  const encrypted = store.get('apiKey');
  if (!encrypted) throw new Error('No API key configured.');
  let apiKey: string;
  if (safeStorage.isEncryptionAvailable()) {
    apiKey = safeStorage.decryptString(Buffer.from(encrypted as string, 'base64'));
  } else {
    apiKey = encrypted as string;
  }

  const anthropic = getClient(apiKey);
  const modelId = (store.get('selectedModel') ?? DEFAULT_MODEL) as string;

  const response = await anthropic.messages.create({
    model: modelId,
    max_tokens: 16384,
    system: prompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  let text = '';
  for (const block of response.content) {
    if (block.type === 'text') text += block.text;
  }

  return {
    text,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
    model: modelId,
  };
}

async function analyzeWithCli(
  prompt: string,
  userMessage: string,
  projectPath: string,
): Promise<{ text: string; tokensIn: number; tokensOut: number; model: string }> {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  const { execFileSync } = await import('node:child_process');
  const os = await import('node:os');

  let claudePath: string;
  try {
    claudePath = execFileSync('which', ['claude'], { encoding: 'utf-8' }).trim();
  } catch {
    claudePath = `${os.homedir()}/.local/bin/claude`;
  }

  const modelId = (store.get('selectedModel') ?? DEFAULT_MODEL) as string;
  let tokensIn = 0, tokensOut = 0;
  let text = '';

  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;
  const homedir = os.homedir();
  cleanEnv.PATH = [
    `${homedir}/.local/bin`, `${homedir}/.nvm/versions/node/current/bin`,
    '/usr/local/bin', '/opt/homebrew/bin', cleanEnv.PATH ?? '',
  ].join(':');

  const ac = new AbortController();
  const abortCheck = setInterval(() => {
    if (activeAbort.aborted) { ac.abort(); clearInterval(abortCheck); }
  }, 200);

  try {
    const session = query({
      prompt: userMessage,
      options: {
        model: modelId,
        cwd: projectPath,
        abortController: ac,
        allowedTools: ['Read', 'Glob', 'Grep'],
        permissionMode: 'acceptEdits',
        maxTurns: 5,
        systemPrompt: prompt,
        persistSession: false,
        pathToClaudeCodeExecutable: claudePath,
        env: cleanEnv,
      },
    });

    for await (const message of session) {
      if (activeAbort.aborted) { ac.abort(); throw new Error('Review cancelled'); }
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'text') text += block.text;
        }
        if (message.message.usage) {
          tokensIn += message.message.usage.input_tokens;
          tokensOut += message.message.usage.output_tokens;
        }
      } else if (message.type === 'result') {
        if (message.usage) {
          tokensIn = message.usage.input_tokens ?? tokensIn;
          tokensOut = message.usage.output_tokens ?? tokensOut;
        }
      }
    }
  } finally {
    clearInterval(abortCheck);
  }

  return { text, tokensIn, tokensOut, model: modelId };
}

async function analyzeWithCodex(
  prompt: string,
  userMessage: string,
  projectPath: string,
): Promise<{ text: string; tokensIn: number; tokensOut: number; model: string }> {
  const { Codex } = await import('@openai/codex-sdk');
  const modelId = (store.get('selectedModel') ?? 'gpt-5.4') as string;
  let tokensIn = 0, tokensOut = 0;
  let text = '';

  const ac = new AbortController();
  const abortCheck = setInterval(() => {
    if (activeAbort.aborted) { ac.abort(); clearInterval(abortCheck); }
  }, 200);

  try {
    const codex = new Codex();
    const thread = codex.startThread({
      model: modelId,
      workingDirectory: projectPath,
      sandboxMode: 'workspace-write',
      approvalPolicy: 'on-failure',
    });

    const fullPrompt = `${prompt}\n\n${userMessage}`;
    const { events } = await thread.runStreamed(fullPrompt, { signal: ac.signal });

    for await (const event of events) {
      if (activeAbort.aborted) { ac.abort(); throw new Error('Review cancelled'); }
      if (event.type === 'item.completed') {
        const item = (event as unknown as { item: { type: string; text?: string } }).item;
        if (item.type === 'agent_message' && item.text) text += item.text;
      } else if (event.type === 'turn.completed') {
        const turnEvent = event as unknown as { usage?: { input_tokens: number; output_tokens: number } };
        if (turnEvent.usage) {
          tokensIn = turnEvent.usage.input_tokens;
          tokensOut = turnEvent.usage.output_tokens;
        }
      }
    }
  } finally {
    clearInterval(abortCheck);
  }

  return { text, tokensIn, tokensOut, model: modelId };
}

// ── JSON Parsing ──

function parseFindings(text: string): ReviewFinding[] {
  let jsonStr = text.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();

  const arrayStart = jsonStr.indexOf('[');
  const arrayEnd = jsonStr.lastIndexOf(']');
  if (arrayStart !== -1 && arrayEnd !== -1) {
    jsonStr = jsonStr.slice(arrayStart, arrayEnd + 1);
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((f: Record<string, unknown>, i: number) => ({
      id: (f.id as string) || `f-${i + 1}`,
      severity: (f.severity as string) || 'info',
      category: (f.category as string) || 'Best Practices',
      file: (f.file as string) || 'unknown',
      line: (f.line as number) || 0,
      title: (f.title as string) || 'Untitled finding',
      description: (f.description as string) || '',
      suggestion: (f.suggestion as string) || '',
    })) as ReviewFinding[];
  } catch {
    return [];
  }
}

// ── Main Entry Points ──

export async function runAnalysis(
  prdId: string,
  projectId: string,
  win: BrowserWindow,
): Promise<ReviewSession> {
  activeAbort = { aborted: false };
  const startTime = Date.now();
  const projectPath = getProjectPath(projectId);
  const db = getDbForProject(projectId);
  const sessionId = randomUUID();
  const now = new Date().toISOString();

  // Get base branch
  const git = simpleGit(projectPath);
  let baseBranch = 'main';
  try {
    const branches = await git.branchLocal();
    if (branches.all.includes('main')) baseBranch = 'main';
    else if (branches.all.includes('master')) baseBranch = 'master';
  } catch { /* use default */ }

  // Create initial session row
  db.prepare(`
    INSERT INTO review_sessions (id, prd_id, status, created_at, updated_at)
    VALUES (?, ?, 'analyzing', ?, ?)
  `).run(sessionId, prdId, now, now);

  try {
    safeSend(win, 'reviewAgent:status', { text: 'Gathering context...' });
    const ctx = await gatherContext(projectPath, baseBranch);

    if (activeAbort.aborted) throw new Error('Review cancelled');

    safeSend(win, 'reviewAgent:status', { text: `Detected: ${ctx.stackProfile}` });

    const stackRules = getStackRules(ctx.frameworks);
    const systemPrompt = buildAnalyzePrompt(ctx.stackProfile, ctx.conventions, stackRules);

    const fileContents = Array.from(ctx.touchedFiles.entries())
      .map(([filePath, content]) => `## ${filePath}\n\`\`\`\n${content}\n\`\`\``)
      .join('\n\n');

    const userMessage = `Review the following code changes:\n\n## Git Diff\n\`\`\`diff\n${ctx.diff}\n\`\`\`\n\n## Full File Contents (for context)\n${fileContents}`;

    safeSend(win, 'reviewAgent:status', { text: `Analyzing ${ctx.touchedFiles.size} files...` });

    const engineMode = (store.get('engineMode') ?? 'claude-code') as EngineMode;
    let result: { text: string; tokensIn: number; tokensOut: number; model: string };

    if (engineMode === 'api-key') {
      result = await analyzeWithSdk(systemPrompt, userMessage);
    } else if (engineMode === 'codex') {
      result = await analyzeWithCodex(systemPrompt, userMessage, projectPath);
    } else {
      result = await analyzeWithCli(systemPrompt, userMessage, projectPath);
    }

    if (activeAbort.aborted) throw new Error('Review cancelled');

    const findings = parseFindings(result.text);

    for (const finding of findings) {
      safeSend(win, 'reviewAgent:findingStream', finding);
    }

    const durationMs = Date.now() - startTime;

    const session: ReviewSession = {
      id: sessionId,
      prdId,
      status: findings.length > 0 ? 'findings' : 'complete',
      stackProfile: ctx.stackProfile,
      diffSummary: ctx.diffSummary,
      findings,
      selectedIds: [],
      fixCommit: null,
      headCommit: ctx.headCommit,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      durationMs,
      engine: engineMode,
      model: result.model,
      createdAt: now,
      updatedAt: new Date().toISOString(),
    };

    db.prepare(`
      UPDATE review_sessions
      SET status = ?, stack_profile = ?, diff_summary = ?, findings = ?,
          head_commit = ?, tokens_in = ?, tokens_out = ?, duration_ms = ?,
          engine = ?, model = ?, updated_at = ?
      WHERE id = ?
    `).run(
      session.status, ctx.stackProfile, ctx.diffSummary,
      JSON.stringify(findings), ctx.headCommit,
      result.tokensIn, result.tokensOut, durationMs,
      engineMode, result.model, session.updatedAt, sessionId,
    );

    safeSend(win, 'reviewAgent:complete', session);
    return session;

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startTime;

    db.prepare(`
      UPDATE review_sessions SET status = 'cancelled', duration_ms = ?, updated_at = ? WHERE id = ?
    `).run(durationMs, new Date().toISOString(), sessionId);

    safeSend(win, 'reviewAgent:status', { text: `Error: ${errorMsg}` });

    return {
      id: sessionId, prdId, status: 'cancelled', stackProfile: '', diffSummary: '',
      findings: [], selectedIds: [], fixCommit: null, headCommit: '',
      tokensIn: 0, tokensOut: 0, durationMs, engine: '', model: '',
      createdAt: now, updatedAt: new Date().toISOString(),
    };
  }
}

export async function runFix(
  sessionId: string,
  selectedIds: string[],
  projectId: string,
  win: BrowserWindow,
): Promise<ReviewSession> {
  activeAbort = { aborted: false };
  const startTime = Date.now();
  const projectPath = getProjectPath(projectId);
  const db = getDbForProject(projectId);

  const row = db.prepare('SELECT * FROM review_sessions WHERE id = ?').get(sessionId) as Record<string, unknown>;
  if (!row) throw new Error('Review session not found');

  const findings: ReviewFinding[] = JSON.parse(row.findings as string);
  const selectedFindings = findings.filter(f => selectedIds.includes(f.id));
  if (selectedFindings.length === 0) throw new Error('No findings selected');

  db.prepare('UPDATE review_sessions SET status = ?, selected_ids = ?, updated_at = ? WHERE id = ?')
    .run('fixing', JSON.stringify(selectedIds), new Date().toISOString(), sessionId);

  safeSend(win, 'reviewAgent:status', { text: `Fixing ${selectedFindings.length} issues...` });

  try {
    // Read affected files
    const affectedFiles = new Set(selectedFindings.map(f => f.file));
    const fileContents: string[] = [];
    for (const filePath of affectedFiles) {
      const fullPath = path.join(projectPath, filePath);
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        fileContents.push(`## ${filePath}\n\`\`\`\n${content}\n\`\`\``);
        safeSend(win, 'reviewAgent:fixProgress', { file: filePath, action: 'reading' });
      } catch { /* skip */ }
    }

    const fixSystemPrompt = buildFixPrompt(selectedFindings);
    const fixUserMessage = `## Files:\n${fileContents.join('\n\n')}`;

    const engineMode = (store.get('engineMode') ?? 'claude-code') as EngineMode;
    let fixTokensIn = 0, fixTokensOut = 0;

    if (engineMode === 'api-key') {
      await fixWithSdk(fixSystemPrompt, fixUserMessage, projectPath, win);
    } else if (engineMode === 'codex') {
      const result = await fixWithCodex(fixSystemPrompt, fixUserMessage, projectPath, win);
      fixTokensIn = result.tokensIn;
      fixTokensOut = result.tokensOut;
    } else {
      const result = await fixWithCli(fixSystemPrompt, fixUserMessage, projectPath, win);
      fixTokensIn = result.tokensIn;
      fixTokensOut = result.tokensOut;
    }

    if (activeAbort.aborted) {
      const git = simpleGit(projectPath);
      await git.checkout(['--', '.']);
      throw new Error('Fix cancelled');
    }

    // Stage and commit (handle "nothing to commit" gracefully —
    // the CLI engine may have already committed, or fixes may be no-ops)
    const git = simpleGit(projectPath);
    let fixCommit: string | null = null;
    try {
      await git.add(['.', ':!.relay/']);
      const status = await git.status();
      if (status.staged.length > 0 || status.files.length > 0) {
        const fixDescriptions = selectedFindings.map(f => `- [${f.severity}] ${f.title} (${f.file}:${f.line})`).join('\n');
        const commitMsg = `fix: code review fixes\n\n${fixDescriptions}`;
        const commitResult = await git.commit(commitMsg);
        fixCommit = commitResult.commit || null;
      }
    } catch {
      // Commit may fail if nothing changed — still treat as success
    }

    const durationMs = Date.now() - startTime;
    const prevTokensIn = (row.tokens_in as number) || 0;
    const prevTokensOut = (row.tokens_out as number) || 0;

    const updatedSession: ReviewSession = {
      id: sessionId,
      prdId: row.prd_id as string,
      status: 'complete',
      stackProfile: row.stack_profile as string,
      diffSummary: row.diff_summary as string,
      findings,
      selectedIds,
      fixCommit,
      headCommit: row.head_commit as string,
      tokensIn: prevTokensIn + fixTokensIn,
      tokensOut: prevTokensOut + fixTokensOut,
      durationMs: (row.duration_ms as number) + durationMs,
      engine: row.engine as string,
      model: row.model as string,
      createdAt: row.created_at as string,
      updatedAt: new Date().toISOString(),
    };

    db.prepare(`
      UPDATE review_sessions
      SET status = 'complete', selected_ids = ?, fix_commit = ?,
          tokens_in = ?, tokens_out = ?, duration_ms = ?, updated_at = ?
      WHERE id = ?
    `).run(
      JSON.stringify(selectedIds), fixCommit,
      updatedSession.tokensIn, updatedSession.tokensOut,
      updatedSession.durationMs, updatedSession.updatedAt, sessionId,
    );

    safeSend(win, 'reviewAgent:complete', updatedSession);
    return updatedSession;

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    db.prepare('UPDATE review_sessions SET status = ?, updated_at = ? WHERE id = ?')
      .run('cancelled', new Date().toISOString(), sessionId);
    safeSend(win, 'reviewAgent:status', { text: `Fix error: ${errorMsg}` });
    throw err;
  }
}

// ── Fix engine implementations ──

async function fixWithSdk(
  systemPrompt: string,
  userMessage: string,
  projectPath: string,
  win: BrowserWindow,
): Promise<string> {
  const { safeStorage } = await import('electron');
  const { getClient } = await import('./runner');
  const encrypted = store.get('apiKey');
  if (!encrypted) throw new Error('No API key configured.');
  let apiKey: string;
  if (safeStorage.isEncryptionAvailable()) {
    apiKey = safeStorage.decryptString(Buffer.from(encrypted as string, 'base64'));
  } else {
    apiKey = encrypted as string;
  }

  const anthropic = getClient(apiKey);
  const modelId = (store.get('selectedModel') ?? DEFAULT_MODEL) as string;

  const tools: Anthropic.Tool[] = [
    {
      name: 'write_file',
      description: 'Write content to a file',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: { type: 'string', description: 'Relative file path' },
          content: { type: 'string', description: 'Full file content' },
        },
        required: ['path', 'content'],
      },
    },
    {
      name: 'edit_file',
      description: 'Edit a file by replacing a specific string',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: { type: 'string', description: 'Relative file path' },
          old_string: { type: 'string', description: 'String to find' },
          new_string: { type: 'string', description: 'Replacement string' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  ];

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }];
  let continueLoop = true;

  while (continueLoop) {
    if (activeAbort.aborted) throw new Error('Fix cancelled');

    const response = await anthropic.messages.create({
      model: modelId,
      max_tokens: 16384,
      system: systemPrompt,
      messages,
      tools,
    });

    const assistantContent: Anthropic.ContentBlockParam[] = [];
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        assistantContent.push({ type: 'text', text: block.text });
      } else if (block.type === 'tool_use') {
        assistantContent.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input });
        const input = block.input as Record<string, string>;

        if (block.name === 'write_file') {
          const fullPath = path.join(projectPath, input.path);
          const dir = path.dirname(fullPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(fullPath, input.content, 'utf-8');
          safeSend(win, 'reviewAgent:fixProgress', { file: input.path, action: 'writing' });
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: `Written: ${input.path}` });
        } else if (block.name === 'edit_file') {
          const fullPath = path.join(projectPath, input.path);
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const idx = content.indexOf(input.old_string);
            if (idx === -1) {
              toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: `Error: old_string not found in ${input.path}` });
            } else {
              const updated = content.slice(0, idx) + input.new_string + content.slice(idx + input.old_string.length);
              fs.writeFileSync(fullPath, updated, 'utf-8');
              safeSend(win, 'reviewAgent:fixProgress', { file: input.path, action: 'editing' });
              toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: `Edited: ${input.path}` });
            }
          } catch {
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: `Error: File not found: ${input.path}` });
          }
        }
      }
    }

    messages.push({ role: 'assistant', content: assistantContent });
    if (toolResults.length > 0) {
      messages.push({ role: 'user', content: toolResults });
    }

    if (response.stop_reason === 'end_turn' && toolResults.length === 0) {
      continueLoop = false;
    }
  }

  return modelId;
}

async function fixWithCli(
  systemPrompt: string,
  userMessage: string,
  projectPath: string,
  win: BrowserWindow,
): Promise<{ tokensIn: number; tokensOut: number; model: string }> {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  const { execFileSync } = await import('node:child_process');
  const os = await import('node:os');

  let claudePath: string;
  try {
    claudePath = execFileSync('which', ['claude'], { encoding: 'utf-8' }).trim();
  } catch {
    claudePath = `${os.homedir()}/.local/bin/claude`;
  }

  const modelId = (store.get('selectedModel') ?? DEFAULT_MODEL) as string;
  let tokensIn = 0, tokensOut = 0;

  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;
  const homedir = os.homedir();
  cleanEnv.PATH = [
    `${homedir}/.local/bin`, `${homedir}/.nvm/versions/node/current/bin`,
    '/usr/local/bin', '/opt/homebrew/bin', cleanEnv.PATH ?? '',
  ].join(':');

  const ac = new AbortController();
  const abortCheck = setInterval(() => {
    if (activeAbort.aborted) { ac.abort(); clearInterval(abortCheck); }
  }, 200);

  try {
    const session = query({
      prompt: userMessage,
      options: {
        model: modelId,
        cwd: projectPath,
        abortController: ac,
        allowedTools: ['Read', 'Glob', 'Grep', 'Edit', 'Write', 'MultiEdit'],
        permissionMode: 'acceptEdits',
        maxTurns: 20,
        systemPrompt,
        persistSession: false,
        pathToClaudeCodeExecutable: claudePath,
        env: cleanEnv,
      },
    });

    for await (const message of session) {
      if (activeAbort.aborted) { ac.abort(); throw new Error('Fix cancelled'); }
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'tool_use') {
            const toolInput = block.input as Record<string, unknown>;
            const filePath = (toolInput.file_path ?? toolInput.path) as string | undefined;
            if (filePath) {
              const displayPath = filePath.startsWith(projectPath + '/') ? filePath.slice(projectPath.length + 1) : filePath;
              safeSend(win, 'reviewAgent:fixProgress', { file: displayPath, action: block.name });
            }
          }
        }
        if (message.message.usage) {
          tokensIn += message.message.usage.input_tokens;
          tokensOut += message.message.usage.output_tokens;
        }
      } else if (message.type === 'result') {
        if (message.usage) {
          tokensIn = message.usage.input_tokens ?? tokensIn;
          tokensOut = message.usage.output_tokens ?? tokensOut;
        }
      }
    }
  } finally {
    clearInterval(abortCheck);
  }

  return { tokensIn, tokensOut, model: modelId };
}

async function fixWithCodex(
  systemPrompt: string,
  userMessage: string,
  projectPath: string,
  win: BrowserWindow,
): Promise<{ tokensIn: number; tokensOut: number; model: string }> {
  const { Codex } = await import('@openai/codex-sdk');
  const modelId = (store.get('selectedModel') ?? 'gpt-5.4') as string;
  let tokensIn = 0, tokensOut = 0;

  const ac = new AbortController();
  const abortCheck = setInterval(() => {
    if (activeAbort.aborted) { ac.abort(); clearInterval(abortCheck); }
  }, 200);

  try {
    const codex = new Codex();
    const thread = codex.startThread({
      model: modelId,
      workingDirectory: projectPath,
      sandboxMode: 'workspace-write',
      approvalPolicy: 'on-failure',
    });

    const { events } = await thread.runStreamed(`${systemPrompt}\n\n${userMessage}`, { signal: ac.signal });
    for await (const event of events) {
      if (activeAbort.aborted) { ac.abort(); throw new Error('Fix cancelled'); }
      if (event.type === 'item.completed') {
        const item = (event as unknown as { item: { type: string; changes?: Array<{ path: string }> } }).item;
        if (item.type === 'file_change' && item.changes) {
          for (const change of item.changes) {
            const displayPath = change.path.startsWith(projectPath + '/') ? change.path.slice(projectPath.length + 1) : change.path;
            safeSend(win, 'reviewAgent:fixProgress', { file: displayPath, action: 'editing' });
          }
        }
      } else if (event.type === 'turn.completed') {
        const turnEvent = event as unknown as { usage?: { input_tokens: number; output_tokens: number } };
        if (turnEvent.usage) {
          tokensIn = turnEvent.usage.input_tokens;
          tokensOut = turnEvent.usage.output_tokens;
        }
      }
    }
  } finally {
    clearInterval(abortCheck);
  }

  return { tokensIn, tokensOut, model: modelId };
}

// ── Session Retrieval ──

export function getReviewSession(prdId: string, projectId: string): ReviewSession | null {
  const db = getDbForProject(projectId);
  const row = db.prepare(
    'SELECT * FROM review_sessions WHERE prd_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(prdId) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    id: row.id as string,
    prdId: row.prd_id as string,
    status: row.status as ReviewSession['status'],
    stackProfile: (row.stack_profile as string) || '',
    diffSummary: (row.diff_summary as string) || '',
    findings: JSON.parse((row.findings as string) || '[]'),
    selectedIds: JSON.parse((row.selected_ids as string) || '[]'),
    fixCommit: (row.fix_commit as string) || null,
    headCommit: (row.head_commit as string) || '',
    tokensIn: (row.tokens_in as number) || 0,
    tokensOut: (row.tokens_out as number) || 0,
    durationMs: (row.duration_ms as number) || 0,
    engine: (row.engine as string) || '',
    model: (row.model as string) || '',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
