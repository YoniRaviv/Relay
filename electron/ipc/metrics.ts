import { ipcMain } from 'electron';
import { openDb } from '../db/connection';
import { store } from './settings';
import { calculateCost, getModelLabel } from '../../shared/pricing';

export interface ProjectMetricsData {
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
  completionRate: number;
  totalBuildTimeMs: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalToolCalls: number;
  avgPasses: number;
  firstPassSuccessRate: number;
  totalCost: number;
  modelBreakdown: Array<{ model: string; label: string; tokensIn: number; tokensOut: number; cost: number }>;
}

export interface TaskMetricRow {
  taskId: string;
  storyId: string;
  title: string;
  status: string;
  passes: number;
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  toolCalls: number;
  cost: number;
  model: string | null;
  modelLabel: string;
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

export function registerMetricsHandlers(): void {
  ipcMain.handle('metrics:project', async (_event, projectId: string, prdId?: string): Promise<ProjectMetricsData> => {
    const db = getDbForProject(projectId);

    const prdFilter = prdId ? ' AND prd_id = ?' : '';
    const prdParams = prdId ? [projectId, prdId] : [projectId];

    const taskCounts = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status IN ('in_progress', 'review', 'failed') THEN 1 ELSE 0 END) as in_progress
      FROM tasks WHERE project_id = ?${prdFilter}
    `).get(...prdParams) as { total: number; completed: number; pending: number; in_progress: number };

    const metricAggs = db.prepare(`
      SELECT
        COALESCE(SUM(m.duration_ms), 0) as total_duration,
        COALESCE(SUM(m.tokens_in), 0) as total_tokens_in,
        COALESCE(SUM(m.tokens_out), 0) as total_tokens_out,
        COALESCE(SUM(m.tool_calls), 0) as total_tool_calls,
        COALESCE(AVG(t.passes), 0) as avg_passes
      FROM tasks t
      LEFT JOIN task_metrics m ON m.task_id = t.id
      WHERE t.project_id = ?${prdFilter}
    `).get(...prdParams) as {
      total_duration: number;
      total_tokens_in: number;
      total_tokens_out: number;
      total_tool_calls: number;
      avg_passes: number;
    };

    const firstPassCount = db.prepare(`
      SELECT COUNT(*) as count FROM tasks
      WHERE project_id = ? AND status = 'done' AND passes <= 1${prdFilter.replace('AND prd_id', 'AND prd_id')}
    `).get(...prdParams) as { count: number };

    const completedCount = taskCounts.completed || 0;

    // Calculate cost per model for accurate pricing
    const modelGroups = db.prepare(`
      SELECT
        COALESCE(m.model, 'claude-sonnet-4-20250514') as model,
        COALESCE(SUM(m.tokens_in), 0) as tokens_in,
        COALESCE(SUM(m.tokens_out), 0) as tokens_out
      FROM task_metrics m
      JOIN tasks t ON m.task_id = t.id
      WHERE t.project_id = ?${prdFilter}
      GROUP BY COALESCE(m.model, 'claude-sonnet-4-20250514')
    `).all(...prdParams) as Array<{ model: string; tokens_in: number; tokens_out: number }>;

    const modelBreakdown = modelGroups.map(g => ({
      model: g.model,
      label: getModelLabel(g.model),
      tokensIn: g.tokens_in,
      tokensOut: g.tokens_out,
      cost: calculateCost(g.tokens_in, g.tokens_out, g.model),
    }));

    const totalCost = modelBreakdown.reduce((sum, g) => sum + g.cost, 0);

    return {
      totalTasks: taskCounts.total,
      completedTasks: completedCount,
      pendingTasks: taskCounts.pending,
      inProgressTasks: taskCounts.in_progress,
      completionRate: taskCounts.total > 0 ? completedCount / taskCounts.total : 0,
      totalBuildTimeMs: metricAggs.total_duration,
      totalTokensIn: metricAggs.total_tokens_in,
      totalTokensOut: metricAggs.total_tokens_out,
      totalToolCalls: metricAggs.total_tool_calls,
      avgPasses: Math.round(metricAggs.avg_passes * 10) / 10,
      firstPassSuccessRate: completedCount > 0 ? firstPassCount.count / completedCount : 0,
      totalCost,
      modelBreakdown,
    };
  });

  ipcMain.handle('metrics:tasks', async (_event, projectId: string, prdId?: string): Promise<TaskMetricRow[]> => {
    const db = getDbForProject(projectId);

    const prdFilter = prdId ? ' AND t.prd_id = ?' : '';
    const prdParams = prdId ? [projectId, prdId] : [projectId];

    const rows = db.prepare(`
      SELECT
        t.id as task_id,
        t.story_id,
        t.title,
        t.status,
        t.passes,
        COALESCE(m.duration_ms, 0) as duration_ms,
        COALESCE(m.tokens_in, 0) as tokens_in,
        COALESCE(m.tokens_out, 0) as tokens_out,
        COALESCE(m.tool_calls, 0) as tool_calls,
        m.model
      FROM tasks t
      LEFT JOIN task_metrics m ON m.task_id = t.id
      WHERE t.project_id = ?${prdFilter}
      ORDER BY t."order" ASC
    `).all(...prdParams) as Array<Record<string, unknown>>;

    return rows.map(r => ({
      taskId: r.task_id as string,
      storyId: r.story_id as string,
      title: r.title as string,
      status: r.status as string,
      passes: r.passes as number,
      durationMs: r.duration_ms as number,
      tokensIn: r.tokens_in as number,
      tokensOut: r.tokens_out as number,
      toolCalls: r.tool_calls as number,
      cost: calculateCost(r.tokens_in as number, r.tokens_out as number, r.model as string | null),
      model: (r.model as string | null) ?? null,
      modelLabel: getModelLabel(r.model as string | null),
    }));
  });

  ipcMain.handle('metrics:export', async (_event, projectId: string) => {
    const db = getDbForProject(projectId);

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as Record<string, unknown>;
    const tasks = db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY "order" ASC').all(projectId);
    const metrics = db.prepare(`
      SELECT m.* FROM task_metrics m
      JOIN tasks t ON m.task_id = t.id
      WHERE t.project_id = ?
    `).all(projectId);

    return {
      project,
      tasks,
      metrics,
      exportedAt: new Date().toISOString(),
    };
  });
}
