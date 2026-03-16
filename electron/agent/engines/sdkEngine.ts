import { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { getClient } from '../runner';
import { buildTaskPrompt, TASK_SYSTEM_PROMPT } from '../promptBuilder';
import { buildCumulativeContext } from '../buildContext';
import { openDb } from '../../db/connection';
import { store } from '../../ipc/settings';
import { safeStorage } from 'electron';
import type { Task, PRD } from '../../../shared/types';
import type Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_MODEL } from '../../../shared/pricing';
import type { TaskEngine, TaskRunResult } from './types';

function safeSend(win: BrowserWindow, channel: string, ...args: unknown[]): void {
  try {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  } catch { /* suppress EPIPE / write-after-destroy */ }
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
    console.error('[sdkEngine] API key decryption failed:', err);
    throw new Error('Failed to decrypt API key. If this persists, re-enter your key in Settings.');
  }
}

function getDbForProject(projectId: string) {
  const projects = store.get('recentProjects', []) as Array<{ path: string }>;
  for (const p of projects) {
    try {
      const db = openDb(p.path);
      const row = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
      if (row) return db;
    } catch {
      continue;
    }
  }
  throw new Error('Project not found');
}

function getProjectContext(projectId: string): string | null {
  try {
    const db = getDbForProject(projectId);
    const row = db.prepare('SELECT context FROM projects WHERE id = ?').get(projectId) as Record<string, unknown> | undefined;
    return (row?.context as string) || null;
  } catch {
    return null;
  }
}

function getPrd(projectId: string): PRD | null {
  const db = getDbForProject(projectId);
  const row = db.prepare(
    'SELECT * FROM prd WHERE project_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(projectId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    description: row.description as string,
    markdown: row.markdown as string,
    status: row.status as PRD['status'],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  projectId: string
): Promise<{ output: string }> {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const projects = store.get('recentProjects', []) as Array<{ path: string }>;
  let projectPath = '';
  for (const p of projects) {
    try {
      const db = openDb(p.path);
      const row = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
      if (row) { projectPath = p.path; break; }
    } catch {
      continue;
    }
  }
  if (!projectPath) return { output: 'Error: Project path not found' };

  const resolve = (p: string) => {
    const resolved = path.resolve(projectPath, p);
    if (!resolved.startsWith(path.resolve(projectPath) + path.sep) && resolved !== path.resolve(projectPath)) {
      throw new Error(`Path traversal blocked: "${p}" resolves outside the project directory`);
    }
    return resolved;
  };

  switch (name) {
    case 'read_file': {
      const filePath = resolve(input.path as string);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return { output: content };
      } catch {
        return { output: `Error: File not found: ${input.path}` };
      }
    }
    case 'write_file': {
      const filePath = resolve(input.path as string);
      try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, input.content as string, 'utf-8');
        return { output: `Written: ${input.path}` };
      } catch (err) {
        return { output: `Error writing file: ${err instanceof Error ? err.message : 'unknown'}` };
      }
    }
    case 'list_files': {
      const dirPath = resolve((input.path as string) || '.');
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const listing = entries
          .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
          .map((e) => `${e.isDirectory() ? '[dir] ' : ''}${e.name}`)
          .join('\n');
        return { output: listing || '(empty directory)' };
      } catch {
        return { output: `Error: Directory not found: ${input.path || '.'}` };
      }
    }
    case 'edit_file': {
      const filePath = resolve(input.path as string);
      const oldStr = input.old_string as string;
      const newStr = input.new_string as string;
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const idx = content.indexOf(oldStr);
        if (idx === -1) {
          return { output: `Error: old_string not found in ${input.path}. Make sure it matches exactly (including whitespace and indentation).` };
        }
        if (content.indexOf(oldStr, idx + 1) !== -1) {
          return { output: `Error: old_string appears multiple times in ${input.path}. Provide more surrounding context to make it unique.` };
        }
        const updated = content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
        fs.writeFileSync(filePath, updated, 'utf-8');
        return { output: `Edited: ${input.path}` };
      } catch {
        return { output: `Error: File not found: ${input.path}` };
      }
    }
    case 'search_files': {
      const pattern = input.pattern as string;
      const searchPath = resolve((input.path as string) || '.');
      try {
        const args = ['--no-heading', '-n', '--color', 'never', '-l'];
        if (input.include) args.push('--glob', input.include as string);
        args.push(pattern, searchPath);
        const result = execFileSync('rg', args, { encoding: 'utf-8', maxBuffer: 1024 * 1024, timeout: 10000 });
        const lines = result.trim().split('\n').slice(0, 50);
        return { output: lines.map((l: string) => l.replace(projectPath + '/', '')).join('\n') || 'No matches found.' };
      } catch (err) {
        // rg returns exit code 1 for no matches
        if ((err as { status?: number }).status === 1) return { output: 'No matches found.' };
        // Fallback to simple grep if rg not available
        try {
          const result = execFileSync('grep', ['-r', '-l', '--include=*', pattern, searchPath], { encoding: 'utf-8', maxBuffer: 1024 * 1024, timeout: 10000 });
          const lines = result.trim().split('\n').slice(0, 50);
          return { output: lines.map((l: string) => l.replace(projectPath + '/', '')).join('\n') || 'No matches found.' };
        } catch {
          return { output: 'No matches found.' };
        }
      }
    }
    case 'task_complete': {
      return { output: `Task marked complete: ${input.summary}` };
    }
    default:
      return { output: `Unknown tool: ${name}` };
  }
}

export const sdkEngine: TaskEngine = {
  async runTask(
    task: Task,
    win: BrowserWindow,
    abortSignal: { aborted: boolean }
  ): Promise<TaskRunResult> {
    const startTime = Date.now();
    let tokensIn = 0;
    let tokensOut = 0;
    let toolCalls = 0;

    try {
      const apiKey = getApiKey();
      const anthropic = getClient(apiKey);
      const prd = getPrd(task.projectId);
      const projectContext = getProjectContext(task.projectId);
      let buildContext: string | null = null;
      try {
        buildContext = await buildCumulativeContext(task.projectId, task.prdId, task);
      } catch (err) {
        console.warn('[sdkEngine] Failed to build cumulative context:', err);
      }
      const prompt = buildTaskPrompt(task, prd, task.rejectionNotes, projectContext, buildContext);

      const db = getDbForProject(task.projectId);
      db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
        .run('in_progress', new Date().toISOString(), task.id);

      safeSend(win,'agent:activity', {
        id: randomUUID(),
        taskId: task.id,
        type: 'text',
        content: `Starting task: ${task.storyId} — ${task.title}`,
        timestamp: new Date().toISOString(),
      });

      const modelId = (store.get('selectedModel') ?? DEFAULT_MODEL) as string;
      const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }];
      let continueLoop = true;

      while (continueLoop) {
        if (abortSignal.aborted) {
          throw new Error('Task aborted');
        }

        const response = await anthropic.messages.create({
          model: modelId,
          max_tokens: 16384,
          system: TASK_SYSTEM_PROMPT,
          messages,
          tools: [
            {
              name: 'read_file',
              description: 'Read a file from the project directory',
              input_schema: {
                type: 'object' as const,
                properties: {
                  path: { type: 'string', description: 'Relative file path to read' },
                },
                required: ['path'],
              },
            },
            {
              name: 'write_file',
              description: 'Write content to a file (creates or overwrites the entire file). For modifying existing files, prefer edit_file instead.',
              input_schema: {
                type: 'object' as const,
                properties: {
                  path: { type: 'string', description: 'Relative file path to write' },
                  content: { type: 'string', description: 'Full file content to write' },
                },
                required: ['path', 'content'],
              },
            },
            {
              name: 'edit_file',
              description: 'Make a targeted edit to an existing file by replacing a specific string. The old_string must match exactly (including whitespace). This is preferred over write_file for modifying existing files.',
              input_schema: {
                type: 'object' as const,
                properties: {
                  path: { type: 'string', description: 'Relative file path to edit' },
                  old_string: { type: 'string', description: 'The exact string to find and replace (must be unique in the file)' },
                  new_string: { type: 'string', description: 'The replacement string' },
                },
                required: ['path', 'old_string', 'new_string'],
              },
            },
            {
              name: 'list_files',
              description: 'List files and directories in a given path. Excludes hidden files and node_modules.',
              input_schema: {
                type: 'object' as const,
                properties: {
                  path: { type: 'string', description: 'Directory path to list (default: .)' },
                },
                required: [],
              },
            },
            {
              name: 'search_files',
              description: 'Search for a text pattern across files in the project. Returns matching file paths. Use this to find where code is defined or used.',
              input_schema: {
                type: 'object' as const,
                properties: {
                  pattern: { type: 'string', description: 'Text or regex pattern to search for' },
                  path: { type: 'string', description: 'Directory to search in (default: project root)' },
                  include: { type: 'string', description: 'Glob pattern to filter files (e.g. "*.ts", "*.tsx")' },
                },
                required: ['pattern'],
              },
            },
            {
              name: 'task_complete',
              description: 'Mark the task as complete. Call this when all acceptance criteria are met.',
              input_schema: {
                type: 'object' as const,
                properties: {
                  summary: { type: 'string', description: 'Summary of what was done' },
                },
                required: ['summary'],
              },
            },
          ],
        });

        tokensIn += response.usage.input_tokens;
        tokensOut += response.usage.output_tokens;

        const assistantContent: Anthropic.ContentBlockParam[] = [];
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type === 'text') {
            assistantContent.push({ type: 'text', text: block.text });
            safeSend(win,'agent:activity', {
              id: randomUUID(),
              taskId: task.id,
              type: 'text',
              content: block.text,
              timestamp: new Date().toISOString(),
            });
          } else if (block.type === 'tool_use') {
            toolCalls++;
            assistantContent.push({
              type: 'tool_use',
              id: block.id,
              name: block.name,
              input: block.input,
            });

            const toolInput = block.input as Record<string, unknown>;
            const filePath = (toolInput.path ?? toolInput.file_path) as string | undefined;
            safeSend(win,'agent:activity', {
              id: randomUUID(),
              taskId: task.id,
              type: 'tool_use',
              content: `Tool: ${block.name}${filePath ? ` — ${filePath}` : ''}`,
              timestamp: new Date().toISOString(),
              toolName: block.name,
              toolUseId: block.id,
              filePath: filePath || undefined,
              toolInput,
            });

            const result = await executeTool(block.name, block.input as Record<string, unknown>, task.projectId);

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: result.output,
            });

            if (block.name === 'task_complete') {
              continueLoop = false;
              safeSend(win,'agent:activity', {
                id: randomUUID(),
                taskId: task.id,
                type: 'text',
                content: (toolInput.summary as string) || 'Task complete.',
                timestamp: new Date().toISOString(),
                toolName: 'task_complete',
              });
            }

            safeSend(win,'agent:activity', {
              id: randomUUID(),
              taskId: task.id,
              type: 'tool_result',
              content: result.output.length > 500 ? result.output.slice(0, 500) + '...' : result.output,
              timestamp: new Date().toISOString(),
              toolUseId: block.id,
            });
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

      if (!abortSignal.aborted) {
        db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
          .run('review', new Date().toISOString(), task.id);
      }

      const durationMs = Date.now() - startTime;

      db.prepare(
        `INSERT INTO task_metrics (id, task_id, duration_ms, tokens_in, tokens_out, tool_calls, passes, model, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(randomUUID(), task.id, durationMs, tokensIn, tokensOut, toolCalls, task.passes + 1, modelId, new Date().toISOString());

      db.prepare(
        `INSERT INTO task_logs (id, task_id, type, content, timestamp)
         VALUES (?, ?, 'text', ?, ?)`
      ).run(randomUUID(), task.id, `Completed in ${Math.round(durationMs / 1000)}s — ${toolCalls} tool calls, ${tokensIn + tokensOut} tokens`, new Date().toISOString());

      safeSend(win,'agent:activity', {
        id: randomUUID(),
        taskId: task.id,
        type: 'text',
        content: `Task complete. Ready for review.`,
        timestamp: new Date().toISOString(),
      });

      return { success: true, tokensIn, tokensOut, toolCalls, durationMs, model: modelId };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      let errorMsg = err instanceof Error ? err.message : (typeof err === 'string' ? err : JSON.stringify(err) ?? 'Unknown error');
      const wasAborted = abortSignal.aborted;

      // Surface model-not-found errors clearly
      if (errorMsg.includes('model') || errorMsg.includes('404') || errorMsg.includes('not_found')) {
        errorMsg = `Model "${(store.get('selectedModel') ?? DEFAULT_MODEL) as string}" is not available. Try a different model in Settings. (${errorMsg})`;
      }

      if (!wasAborted) {
        try {
          const db = getDbForProject(task.projectId);
          db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
            .run('failed', new Date().toISOString(), task.id);
        } catch {
          // ignore db errors during error handling
        }

        safeSend(win,'agent:activity', {
          id: randomUUID(),
          taskId: task.id,
          type: 'error',
          content: `Error: ${errorMsg}`,
          timestamp: new Date().toISOString(),
        });
      }

      return { success: false, tokensIn, tokensOut, toolCalls, durationMs, model: (store.get('selectedModel') ?? DEFAULT_MODEL) as string, error: wasAborted ? 'aborted' : errorMsg };
    }
  },
};
