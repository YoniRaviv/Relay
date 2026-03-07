import { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { getClient } from '../runner';
import { buildTaskPrompt } from '../promptBuilder';
import { openDb } from '../../db/connection';
import { store } from '../../ipc/settings';
import { safeStorage } from 'electron';
import type { Task, PRD } from '../../../shared/types';
import type Anthropic from '@anthropic-ai/sdk';
import type { TaskEngine, TaskRunResult } from './types';

function getApiKey(): string {
  const encrypted = store.get('apiKey');
  if (!encrypted) throw new Error('No API key configured');
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(encrypted as string, 'base64'));
  }
  return encrypted as string;
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

  const resolve = (p: string) => path.resolve(projectPath, p);

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
      const prompt = buildTaskPrompt(task, prd, task.rejectionNotes);

      const db = getDbForProject(task.projectId);
      db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
        .run('in_progress', new Date().toISOString(), task.id);

      win.webContents.send('agent:activity', {
        id: randomUUID(),
        taskId: task.id,
        type: 'text',
        content: `Starting task: ${task.storyId} — ${task.title}`,
        timestamp: new Date().toISOString(),
      });

      const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }];
      let continueLoop = true;

      while (continueLoop) {
        if (abortSignal.aborted) {
          throw new Error('Task aborted');
        }

        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 16384,
          system: 'You are an expert software engineer completing a coding task. Use the provided tools to read, edit, and create files as needed. Work methodically through the acceptance criteria.',
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
              description: 'Write content to a file (creates or overwrites)',
              input_schema: {
                type: 'object' as const,
                properties: {
                  path: { type: 'string', description: 'Relative file path to write' },
                  content: { type: 'string', description: 'File content to write' },
                },
                required: ['path', 'content'],
              },
            },
            {
              name: 'list_files',
              description: 'List files in a directory',
              input_schema: {
                type: 'object' as const,
                properties: {
                  path: { type: 'string', description: 'Directory path to list (default: .)' },
                },
                required: [],
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
            win.webContents.send('agent:activity', {
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

            win.webContents.send('agent:activity', {
              id: randomUUID(),
              taskId: task.id,
              type: 'tool_use',
              content: `Tool: ${block.name}${(block.input as Record<string, unknown>).path ? ` — ${(block.input as Record<string, unknown>).path}` : ''}`,
              timestamp: new Date().toISOString(),
            });

            const result = await executeTool(block.name, block.input as Record<string, unknown>, task.projectId);

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: result.output,
            });

            if (block.name === 'task_complete') {
              continueLoop = false;
            }

            win.webContents.send('agent:activity', {
              id: randomUUID(),
              taskId: task.id,
              type: 'tool_result',
              content: result.output.length > 500 ? result.output.slice(0, 500) + '...' : result.output,
              timestamp: new Date().toISOString(),
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

      db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
        .run('review', new Date().toISOString(), task.id);

      const durationMs = Date.now() - startTime;

      db.prepare(
        `INSERT INTO task_metrics (id, task_id, duration_ms, tokens_in, tokens_out, tool_calls, passes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(randomUUID(), task.id, durationMs, tokensIn, tokensOut, toolCalls, task.passes + 1, new Date().toISOString());

      db.prepare(
        `INSERT INTO task_logs (id, task_id, type, content, timestamp)
         VALUES (?, ?, 'text', ?, ?)`
      ).run(randomUUID(), task.id, `Completed in ${Math.round(durationMs / 1000)}s — ${toolCalls} tool calls, ${tokensIn + tokensOut} tokens`, new Date().toISOString());

      win.webContents.send('agent:activity', {
        id: randomUUID(),
        taskId: task.id,
        type: 'text',
        content: `Task complete. Ready for review.`,
        timestamp: new Date().toISOString(),
      });

      return { success: true, tokensIn, tokensOut, toolCalls, durationMs };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';

      try {
        const db = getDbForProject(task.projectId);
        db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
          .run('failed', new Date().toISOString(), task.id);
      } catch {
        // ignore db errors during error handling
      }

      win.webContents.send('agent:activity', {
        id: randomUUID(),
        taskId: task.id,
        type: 'error',
        content: `Error: ${errorMsg}`,
        timestamp: new Date().toISOString(),
      });

      return { success: false, tokensIn, tokensOut, toolCalls, durationMs, error: errorMsg };
    }
  },
};
