import { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { Codex } from '@openai/codex-sdk';
import type { ThreadEvent, ThreadItem } from '@openai/codex-sdk';
import { buildTaskPrompt, TASK_SYSTEM_PROMPT } from '../promptBuilder';
import { buildCumulativeContext } from '../buildContext';
import { openDb } from '../../db/connection';
import { store } from '../../ipc/settings';
import type { Task, PRD } from '../../../shared/types';
import type { TaskEngine, TaskRunResult } from './types';

function safeSend(win: BrowserWindow, channel: string, ...args: unknown[]): void {
  try {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  } catch { /* suppress */ }
}

function getDbForProject(projectId: string) {
  const projects = store.get('recentProjects', []) as Array<{ path: string }>;
  for (const p of projects) {
    try {
      const db = openDb(p.path);
      const row = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
      if (row) return db;
    } catch { continue; }
  }
  throw new Error('Project not found');
}

function getProjectPath(projectId: string): string {
  const projects = store.get('recentProjects', []) as Array<{ path: string }>;
  for (const p of projects) {
    try {
      const db = openDb(p.path);
      const row = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
      if (row) return p.path;
    } catch { continue; }
  }
  throw new Error('Project path not found');
}

function getProjectContext(projectId: string): string | null {
  try {
    const db = getDbForProject(projectId);
    const row = db.prepare('SELECT context FROM projects WHERE id = ?').get(projectId) as Record<string, unknown> | undefined;
    return (row?.context as string) || null;
  } catch { return null; }
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

function formatItemForActivity(item: ThreadItem, projectPath: string): { type: string; content: string; toolName?: string; filePath?: string } {
  switch (item.type) {
    case 'agent_message':
      return { type: 'text', content: item.text };
    case 'reasoning':
      return { type: 'text', content: `[reasoning] ${item.text}` };
    case 'command_execution': {
      const exitInfo = item.exit_code !== undefined ? ` (exit ${item.exit_code})` : '';
      return {
        type: 'tool_use',
        content: `Run command: ${item.command}${exitInfo}`,
        toolName: 'Bash',
      };
    }
    case 'file_change': {
      const files = item.changes.map(c => {
        const displayPath = c.path.startsWith(projectPath + '/') ? c.path.slice(projectPath.length + 1) : c.path;
        return `${c.kind}: ${displayPath}`;
      }).join(', ');
      const firstPath = item.changes[0]?.path ?? '';
      const displayFilePath = firstPath.startsWith(projectPath + '/') ? firstPath.slice(projectPath.length + 1) : firstPath;
      return {
        type: 'tool_use',
        content: `File changes: ${files}`,
        toolName: 'Edit',
        filePath: displayFilePath || undefined,
      };
    }
    case 'mcp_tool_call':
      return {
        type: 'tool_use',
        content: `Tool: ${item.server}/${item.tool}`,
        toolName: item.tool,
      };
    case 'error':
      return { type: 'error', content: item.message };
    case 'todo_list': {
      const todos = item.items.map(t => `${t.completed ? '\u2713' : '\u25CB'} ${t.text}`).join('\n');
      return { type: 'text', content: `Plan:\n${todos}` };
    }
    default:
      return { type: 'text', content: `[${(item as { type: string }).type}]` };
  }
}

const DEFAULT_CODEX_MODEL = 'gpt-5.4';

export const codexEngine: TaskEngine = {
  async runTask(
    task: Task,
    win: BrowserWindow,
    abortSignal: { aborted: boolean }
  ): Promise<TaskRunResult> {
    const startTime = Date.now();
    const selectedModel = (store.get('selectedModel') ?? DEFAULT_CODEX_MODEL) as string;
    let tokensIn = 0;
    let tokensOut = 0;
    let toolCalls = 0;

    try {
      const projectPath = getProjectPath(task.projectId);
      const prd = getPrd(task.projectId);
      const projectContext = getProjectContext(task.projectId);
      let buildContext: string | null = null;
      try {
        buildContext = await buildCumulativeContext(task.projectId, task.prdId, task);
      } catch (err) {
        console.warn('[codexEngine] Failed to build cumulative context:', err);
      }
      const prompt = buildTaskPrompt(task, prd, task.rejectionNotes, projectContext, buildContext);

      const db = getDbForProject(task.projectId);
      db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
        .run('in_progress', new Date().toISOString(), task.id);

      safeSend(win, 'agent:activity', {
        id: randomUUID(),
        taskId: task.id,
        type: 'text',
        content: `Starting task (Codex CLI): ${task.storyId} \u2014 ${task.title}`,
        timestamp: new Date().toISOString(),
      });

      const ac = new AbortController();
      const abortCheck = setInterval(() => {
        if (abortSignal.aborted) {
          ac.abort();
          clearInterval(abortCheck);
        }
      }, 200);

      const TASK_TIMEOUT_MS = 10 * 60 * 1000;
      const taskTimeout = setTimeout(() => {
        if (!abortSignal.aborted) {
          ac.abort();
          safeSend(win, 'agent:activity', {
            id: randomUUID(),
            taskId: task.id,
            type: 'error',
            content: `Task timed out after ${TASK_TIMEOUT_MS / 60000} minutes.`,
            timestamp: new Date().toISOString(),
          });
        }
      }, TASK_TIMEOUT_MS);

      try {
        const codex = new Codex();
        const thread = codex.startThread({
          model: selectedModel,
          workingDirectory: projectPath,
          sandboxMode: 'workspace-write',
          approvalPolicy: 'on-failure',
        });

        const fullPrompt = `${TASK_SYSTEM_PROMPT}\n\n${prompt}`;
        const { events } = await thread.runStreamed(fullPrompt, { signal: ac.signal });

        for await (const event of events) {
          if (abortSignal.aborted) {
            ac.abort();
            throw new Error('Task aborted');
          }

          if (event.type === 'item.started' || event.type === 'item.completed') {
            const item = (event as ThreadEvent & { item: ThreadItem }).item;
            if (item.type === 'command_execution' || item.type === 'file_change' || item.type === 'mcp_tool_call') {
              toolCalls++;
            }
            const formatted = formatItemForActivity(item, projectPath);
            safeSend(win, 'agent:activity', {
              id: randomUUID(),
              taskId: task.id,
              type: formatted.type,
              content: formatted.content,
              timestamp: new Date().toISOString(),
              toolName: formatted.toolName,
              filePath: formatted.filePath,
            });
          } else if (event.type === 'turn.completed') {
            const turnEvent = event as ThreadEvent & { usage?: { input_tokens: number; output_tokens: number } };
            if (turnEvent.usage) {
              tokensIn = turnEvent.usage.input_tokens;
              tokensOut = turnEvent.usage.output_tokens;
            }
          } else if (event.type === 'turn.failed') {
            const failedEvent = event as ThreadEvent & { error: { message: string } };
            throw new Error(failedEvent.error.message);
          } else if (event.type === 'error') {
            const errorEvent = event as ThreadEvent & { message: string };
            throw new Error(errorEvent.message);
          }
        }
      } finally {
        clearInterval(abortCheck);
        clearTimeout(taskTimeout);
      }

      if (!abortSignal.aborted) {
        db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
          .run('review', new Date().toISOString(), task.id);
      }

      const durationMs = Date.now() - startTime;

      db.prepare(
        `INSERT INTO task_metrics (id, task_id, duration_ms, tokens_in, tokens_out, tool_calls, passes, model, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(randomUUID(), task.id, durationMs, tokensIn, tokensOut, toolCalls, task.passes + 1, selectedModel, new Date().toISOString());

      db.prepare(
        `INSERT INTO task_logs (id, task_id, type, content, timestamp)
         VALUES (?, ?, 'text', ?, ?)`
      ).run(randomUUID(), task.id, `Completed in ${Math.round(durationMs / 1000)}s \u2014 ${toolCalls} tool calls, ${tokensIn + tokensOut} tokens (Codex engine)`, new Date().toISOString());

      safeSend(win, 'agent:activity', {
        id: randomUUID(),
        taskId: task.id,
        type: 'text',
        content: 'Task complete. Ready for review.',
        timestamp: new Date().toISOString(),
      });

      return { success: true, tokensIn, tokensOut, toolCalls, durationMs, model: selectedModel };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      const wasAborted = abortSignal.aborted;

      if (!wasAborted) {
        try {
          const db = getDbForProject(task.projectId);
          db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
            .run('failed', new Date().toISOString(), task.id);
        } catch { /* ignore */ }

        safeSend(win, 'agent:activity', {
          id: randomUUID(),
          taskId: task.id,
          type: 'error',
          content: `Error: ${errorMsg}`,
          timestamp: new Date().toISOString(),
        });
        console.error('[codexEngine] Task failed:', err);
      }

      return { success: false, tokensIn, tokensOut, toolCalls, durationMs, model: selectedModel, error: wasAborted ? 'aborted' : errorMsg };
    }
  },
};
