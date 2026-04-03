// ── Status Enums ──

export type ProjectStatus = 'active' | 'archived';

export type PRDStatus = 'draft' | 'approved' | 'completed';

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'review'
  | 'failed'
  | 'done';

export type TaskPriority = 'high' | 'medium' | 'low';

export type LoopState = 'idle' | 'running' | 'paused' | 'stopped';

export type BuildMode = 'review' | 'continuous' | 'auto-pilot';

export type EngineMode = 'api-key' | 'claude-code' | 'codex';

export type CliToolsPreset = 'conservative' | 'full';

export type SessionMode = 'per-task' | 'persistent';

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
  title?: string | null;
  description: string;
  markdown: string;
  status: PRDStatus;
  isArchived?: boolean;
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
  dependsOn: string | null;  // comma-separated task IDs
  createdAt: string;
  updatedAt: string;
}

export interface TaskLog {
  id: string;
  taskId: string;
  type: 'text' | 'tool_use' | 'tool_result' | 'error' | 'warning';
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

// ── Code Review Agent ──

export type ReviewSeverity = 'critical' | 'warning' | 'info';
export type ReviewCategory =
  | 'Security'
  | 'Performance'
  | 'Race Condition'
  | 'Error Handling'
  | 'Best Practices'
  | 'Conventions'
  | 'Accessibility';
export type ReviewSessionStatus = 'analyzing' | 'findings' | 'fixing' | 'complete' | 'cancelled';

export interface ReviewFinding {
  id: string;
  severity: ReviewSeverity;
  category: ReviewCategory;
  file: string;
  line: number;
  title: string;
  description: string;
  suggestion: string;
}

export interface ReviewSession {
  id: string;
  prdId: string;
  status: ReviewSessionStatus;
  stackProfile: string;
  diffSummary: string;
  findings: ReviewFinding[];
  selectedIds: string[];
  fixCommit: string | null;
  headCommit: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  engine: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

// ── Wizard / Brainstorm ──

export type WizardMode = 'specification' | 'brainstorm' | 'manual';

export interface BrainstormQuestion {
  type: 'question';
  question: string;
  options?: string[];
}

export interface BrainstormApproaches {
  type: 'approaches';
  summary: string;
  approaches: Array<{ title: string; description: string; tradeoffs: string }>;
  recommendation: string;
}

export interface BrainstormDesignSection {
  type: 'design-section';
  title: string;
  content: string;
}

export interface BrainstormReady {
  type: 'ready';
  summary: string;
}

export type BrainstormBlock =
  | BrainstormQuestion
  | BrainstormApproaches
  | BrainstormDesignSection
  | BrainstormReady;

export interface BrainstormMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  block?: BrainstormBlock;
  timestamp: number;
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
