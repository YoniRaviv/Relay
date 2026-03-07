// ── Status Enums ──

export type ProjectStatus = 'active' | 'archived';

export type PRDStatus = 'draft' | 'approved';

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'review'
  | 'failed'
  | 'done'
  | 'approved';

export type TaskPriority = 'high' | 'medium' | 'low';

export type LoopState = 'idle' | 'running' | 'paused' | 'stopped';

export type EngineMode = 'api-key' | 'claude-code';

export type CliToolsPreset = 'conservative' | 'full';

// ── Data Interfaces ──

export interface Project {
  id: string;
  name: string;
  path: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PRD {
  id: string;
  projectId: string;
  description: string;
  markdown: string;
  status: PRDStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  prdId: string;
  storyId: string;
  title: string;
  description: string;
  acceptanceCriteria: string;
  priority: TaskPriority;
  status: TaskStatus;
  order: number;
  passes: number;
  rejectionNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskLog {
  id: string;
  taskId: string;
  type: 'text' | 'tool_use' | 'tool_result' | 'error';
  content: string;
  timestamp: string;
}

export interface TaskMetric {
  id: string;
  taskId: string;
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  toolCalls: number;
  passes: number;
  createdAt: string;
}

// ── IPC Types ──

export interface AuthStatus {
  valid: boolean;
  error?: string;
}

export interface ProjectCreateParams {
  name: string;
  path: string;
}

export interface RecentProject {
  name: string;
  path: string;
  lastOpened: string;
}
