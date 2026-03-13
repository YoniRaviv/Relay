// ── Status Enums ──

export type ProjectStatus = 'active' | 'archived';

export type PRDStatus = 'draft' | 'approved' | 'completed';

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'review'
  | 'failed'
  | 'done'
  | 'approved';

export type TaskPriority = 'high' | 'medium' | 'low';

export type LoopState = 'idle' | 'running' | 'paused' | 'stopped';

export type BuildMode = 'review' | 'continuous' | 'auto-commit';

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
  commitHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskLog {
  id: string;
  taskId: string;
  type: 'text' | 'tool_use' | 'tool_result' | 'error';
  content: string;
  timestamp: string;
  // Structured metadata (optional, backward-compatible)
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolUseId?: string;
  filePath?: string;
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

// ── Image Attachment ──

export interface ImageAttachment {
  id: string;
  name: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  base64Data: string;
  sizeBytes: number;
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
