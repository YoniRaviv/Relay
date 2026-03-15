import { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { buildTaskPrompt } from '../promptBuilder';
import { openDb } from '../../db/connection';
import { store } from '../../ipc/settings';
import type { Task, PRD } from '../../../shared/types';
import { DEFAULT_MODEL } from '../../../shared/pricing';
import type { TaskEngine, TaskRunResult, CliToolsPreset } from './types';

function safeSend(win: BrowserWindow, channel: string, ...args: unknown[]): void {
  try {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  } catch { /* suppress EPIPE / write-after-destroy */ }
}

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

const CONSERVATIVE_TOOLS = ['Read', 'Glob', 'Grep', 'Edit', 'Write', 'MultiEdit'];
const FULL_TOOLS = [...CONSERVATIVE_TOOLS, 'Bash', 'WebFetch', 'NotebookEdit'];

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

function getProjectPath(projectId: string): string {
  const projects = store.get('recentProjects', []) as Array<{ path: string }>;
  for (const p of projects) {
    try {
      const db = openDb(p.path);
      const row = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
      if (row) return p.path;
    } catch {
      continue;
    }
  }
  throw new Error('Project path not found');
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

function getPresetTools(): string[] {
  const preset = (store.get('cliToolsPreset') ?? 'conservative') as CliToolsPreset;
  return preset === 'full' ? FULL_TOOLS : CONSERVATIVE_TOOLS;
}

export const cliEngine: TaskEngine = {
  async runTask(
    task: Task,
    win: BrowserWindow,
    abortSignal: { aborted: boolean }
  ): Promise<TaskRunResult> {
    const startTime = Date.now();
    const selectedModel = (store.get('selectedModel') ?? DEFAULT_MODEL) as string;
    let tokensIn = 0;
    let tokensOut = 0;
    let toolCalls = 0;
    let detectedModel: string | undefined = selectedModel;

    try {
      const projectPath = getProjectPath(task.projectId);
      const prd = getPrd(task.projectId);
      const projectContext = getProjectContext(task.projectId);
      const prompt = buildTaskPrompt(task, prd, task.rejectionNotes, projectContext);

      const db = getDbForProject(task.projectId);
      db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
        .run('in_progress', new Date().toISOString(), task.id);

      safeSend(win,'agent:activity', {
        id: randomUUID(),
        taskId: task.id,
        type: 'text',
        content: `Starting task (Claude Code CLI): ${task.storyId} — ${task.title}`,
        timestamp: new Date().toISOString(),
      });

      const ac = new AbortController();

      // Bridge the simple abortSignal to the AbortController
      const abortCheck = setInterval(() => {
        if (abortSignal.aborted) {
          ac.abort();
          clearInterval(abortCheck);
        }
      }, 200);

      try {
        // Build clean env:
        // 1. Strip CLAUDECODE to prevent "nested session" detection
        // 2. Ensure PATH includes common locations (Electron GUI apps get minimal PATH on macOS)
        const cleanEnv = { ...process.env };
        delete cleanEnv.CLAUDECODE;

        const os = await import('os');
        const homedir = os.homedir();
        const extraPaths = [
          `${homedir}/.local/bin`,
          `${homedir}/.nvm/versions/node/current/bin`,
          '/usr/local/bin',
          '/opt/homebrew/bin',
        ];
        cleanEnv.PATH = [...extraPaths, cleanEnv.PATH ?? ''].join(':');

        const session = query({
          prompt,
          options: {
            model: selectedModel,
            cwd: projectPath,
            abortController: ac,
            allowedTools: getPresetTools(),
            permissionMode: 'acceptEdits',
            maxTurns: 50,
            systemPrompt: 'You are an expert software engineer completing a coding task. Work methodically through the acceptance criteria. Read existing code before making changes. Follow existing patterns and conventions.',
            persistSession: false,
            pathToClaudeCodeExecutable: getClaudePath(),
            env: cleanEnv,
            debug: true,
            stderr: (data: string) => {
              console.error('[cliEngine:stderr]', data);
            },
          },
        });

        for await (const message of session) {
          if (abortSignal.aborted) {
            ac.abort();
            throw new Error('Task aborted');
          }

          if (message.type === 'assistant') {
            // Capture model from the first assistant message
            if (!detectedModel && (message.message as { model?: string }).model) {
              detectedModel = (message.message as { model?: string }).model;
            }
            // Process content blocks from the assistant message
            for (const block of message.message.content) {
              if (block.type === 'text') {
                safeSend(win,'agent:activity', {
                  id: randomUUID(),
                  taskId: task.id,
                  type: 'text',
                  content: block.text,
                  timestamp: new Date().toISOString(),
                });
              } else if (block.type === 'tool_use') {
                toolCalls++;
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
              }
            }

            // Capture usage from each assistant message
            if (message.message.usage) {
              tokensIn += message.message.usage.input_tokens;
              tokensOut += message.message.usage.output_tokens;
            }
          } else if (message.type === 'result') {
            // Use the result's aggregated usage (more accurate)
            tokensIn = message.usage.input_tokens;
            tokensOut = message.usage.output_tokens;
            if ((message as { model?: string }).model) {
              detectedModel = (message as { model?: string }).model;
            }

            if (message.subtype !== 'success') {
              const errorResult = message as { errors?: string[] };
              const errorMsg = errorResult.errors?.join(', ') ?? 'Task failed';
              throw new Error(errorMsg);
            }
          } else if (message.type === 'system') {
            const sysMsg = message as { content?: string };
            if (sysMsg.content) {
              safeSend(win,'agent:activity', {
                id: randomUUID(),
                taskId: task.id,
                type: 'text',
                content: `[system] ${sysMsg.content}`,
                timestamp: new Date().toISOString(),
              });
            }
          }
        }
      } finally {
        clearInterval(abortCheck);
      }

      // Mark task as review (only if not aborted)
      if (!abortSignal.aborted) {
        db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
          .run('review', new Date().toISOString(), task.id);
      }

      const durationMs = Date.now() - startTime;

      db.prepare(
        `INSERT INTO task_metrics (id, task_id, duration_ms, tokens_in, tokens_out, tool_calls, passes, model, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(randomUUID(), task.id, durationMs, tokensIn, tokensOut, toolCalls, task.passes + 1, detectedModel ?? null, new Date().toISOString());

      db.prepare(
        `INSERT INTO task_logs (id, task_id, type, content, timestamp)
         VALUES (?, ?, 'text', ?, ?)`
      ).run(randomUUID(), task.id, `Completed in ${Math.round(durationMs / 1000)}s — ${toolCalls} tool calls, ${tokensIn + tokensOut} tokens (CLI engine)`, new Date().toISOString());

      safeSend(win,'agent:activity', {
        id: randomUUID(),
        taskId: task.id,
        type: 'text',
        content: `Task complete. Ready for review.`,
        timestamp: new Date().toISOString(),
      });

      return { success: true, tokensIn, tokensOut, toolCalls, durationMs, model: detectedModel };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : (typeof err === 'string' ? err : JSON.stringify(err) ?? 'Unknown error');
      const wasAborted = abortSignal.aborted;

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

        // Log the full error for debugging
        console.error('[cliEngine] Task failed:', err);
      }

      return { success: false, tokensIn, tokensOut, toolCalls, durationMs, model: detectedModel, error: wasAborted ? 'aborted' : errorMsg };
    }
  },
};
