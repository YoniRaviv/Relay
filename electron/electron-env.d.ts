/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    APP_ROOT: string
    VITE_PUBLIC: string
  }
}

interface RelayAPI {
  // App info
  getAppInfo(): Promise<{ version: string; electron: string; node: string }>

  // Updater
  checkForUpdates(): Promise<{ version: string } | null>
  downloadUpdate(): Promise<void>
  installUpdate(): Promise<void>

  // Settings
  checkAuth(): Promise<import('../shared/types').AuthStatus>
  setApiKey(key: string): Promise<import('../shared/types').AuthStatus>
  getApiKey(): Promise<string | null>
  getSettings(): Promise<{ hasApiKey: boolean; recentProjects: import('../shared/types').RecentProject[] }>

  // Engine
  getEngineMode(): Promise<import('../shared/types').EngineMode>
  setEngineMode(mode: import('../shared/types').EngineMode): Promise<void>
  getCliToolsPreset(): Promise<import('../shared/types').CliToolsPreset>
  setCliToolsPreset(preset: import('../shared/types').CliToolsPreset): Promise<void>
  checkCliAvailable(): Promise<{ available: boolean; path?: string; error?: string }>
  checkCodexAvailable(): Promise<{ available: boolean; path?: string; error?: string }>
  getSelectedModel(): Promise<string>
  setSelectedModel(model: string): Promise<void>
  getMaxPasses(): Promise<number>
  setMaxPasses(max: number): Promise<void>
  getBuildMode(): Promise<import('../shared/types').BuildMode>
  setBuildMode(mode: import('../shared/types').BuildMode): Promise<void>
  getCommitPrefix(): Promise<string>
  setCommitPrefix(prefix: string): Promise<void>
  getNotificationsEnabled(): Promise<boolean>
  setNotificationsEnabled(enabled: boolean): Promise<void>

  // Project
  createProject(params: { name: string; path: string }): Promise<import('../shared/types').Project>
  openProject(path: string): Promise<import('../shared/types').Project | null>
  listProjects(): Promise<import('../shared/types').RecentProject[]>
  selectFolder(): Promise<string | null>
  scanProject(projectId: string): Promise<{ status: string; context: string }>
  getProjectContext(projectId: string): Promise<string | null>
  listProjectFiles(projectId: string, query?: string): Promise<string[]>

  // PRD
  clarifyPrd(projectId: string, description: string, projectContext?: string, attachments?: import('../shared/types').ImageAttachment[]): Promise<{ status: string; text: string }>
  generatePrd(projectId: string, description: string, clarifications?: string, projectContext?: string, attachments?: import('../shared/types').ImageAttachment[]): Promise<unknown>
  decomposePrd(projectId: string, prdMarkdown: string, projectContext?: string): Promise<unknown>
  savePrd(prd: unknown): Promise<unknown>
  renamePrd(prdId: string, title: string): Promise<{ status: string }>
  getPrd(projectId: string): Promise<import('../shared/types').PRD | null>
  listPrds(projectId: string): Promise<Array<import('../shared/types').PRD & { taskCount: number; doneCount: number }>>
  deletePrd(prdId: string): Promise<unknown>
  prdSetFeatureBranch(prdId: string, branch: string): Promise<{ status: string }>
  prdExportMarkdown(projectId: string, prdId: string): Promise<{ status: string; markdown: string }>
  archiveFeature(prdId: string): Promise<{ status: string }>
  unarchiveFeature(prdId: string): Promise<{ status: string }>
  listArchivedFeatures(projectId: string): Promise<Array<import('../shared/types').PRD & { taskCount: number; doneCount: number }>>

  // Brainstorm
  brainstormStart(projectId: string, description: string, projectContext?: string, attachments?: import('../shared/types').ImageAttachment[]): Promise<{ status: string; sessionId: string }>
  brainstormRespond(sessionId: string, message: string): Promise<{ status: string }>
  brainstormFinalize(sessionId: string): Promise<{ status: string }>
  brainstormCleanup(sessionId: string): Promise<{ status: string }>

  // Tasks
  listTasks(projectId: string, prdId?: string): Promise<import('../shared/types').Task[]>
  updateTask(taskId: string, updates: Partial<import('../shared/types').Task>): Promise<unknown>
  reorderTasks(tasks: unknown): Promise<unknown>
  createTask(params: { projectId: string; prdId: string; title: string; description: string; acceptanceCriteria: string; priority: string }): Promise<{ status: string; task: import('../shared/types').Task }>
  deleteTask(taskId: string): Promise<unknown>
  getTaskLogs(taskId: string): Promise<import('../shared/types').TaskLog[]>

  // Agent Loop
  startLoop(projectId?: string, prdId?: string, buildMode?: import('../shared/types').BuildMode): Promise<unknown>
  pauseLoop(): Promise<unknown>
  resumeLoop(): Promise<unknown>
  stopLoop(): Promise<unknown>

  // Git
  gitDiff(projectId: string): Promise<string>
  gitCommit(projectId: string, message: string): Promise<unknown>
  gitLog(projectId: string): Promise<unknown[]>
  gitStatus(projectId: string): Promise<{ clean: boolean; files: Array<{ path: string; insertions: number; deletions: number; status: 'new' | 'modified' | 'deleted' | 'renamed' }> }>
  gitBranch(projectId: string): Promise<{ current: string; branches: string[] }>
  gitCheckout(projectId: string, branch: string): Promise<{ status: string }>
  gitPull(projectId: string): Promise<{ summary: unknown }>
  gitCreateBranch(projectId: string, branchName: string, baseBranch: string): Promise<{ status: string; branch: string }>
  gitPush(projectId: string): Promise<{ status: string }>
  gitStash(projectId: string, message?: string): Promise<{ status: string }>
  gitStashPop(projectId: string, branch?: string): Promise<{ status: string; popped: boolean }>
  gitCreatePr(projectId: string, title: string, body: string, baseBranch: string): Promise<{ url: string; pushFailed?: boolean }>
  gitAddRemote(projectId: string, url: string): Promise<{ status: string }>
  gitHasRemote(projectId: string): Promise<{ hasRemote: boolean }>
  gitGetPrUrl(projectId: string): Promise<{ url: string | null; state: string | null }>
  gitCheckInit(projectId: string): Promise<{ initialized: boolean }>
  gitInit(projectId: string): Promise<{ status: string }>
  gitEnsureGitignore(projectId: string): Promise<{ status: string }>
  gitCommitFiles(projectId: string, commitHash: string): Promise<string[]>

  // Review
  reviewGetDiff(projectId: string, taskId?: string): Promise<string>
  reviewApprove(projectId: string, taskId: string, commitMessage: string): Promise<unknown>
  reviewReject(projectId: string, taskId: string, notes: string): Promise<unknown>

  // Code Review Agent
  reviewAgentAnalyze(prdId: string): Promise<import('../shared/types').ReviewSession>
  reviewAgentFix(sessionId: string, selectedIds: string[]): Promise<import('../shared/types').ReviewSession>
  reviewAgentCancel(): Promise<void>
  reviewAgentGetSession(prdId: string): Promise<import('../shared/types').ReviewSession | null>

  // Metrics
  projectMetrics(projectId: string, prdId?: string): Promise<unknown>
  taskMetrics(projectId: string, prdId?: string): Promise<unknown>
  exportMetrics(projectId: string): Promise<unknown>

  // Runner
  detectRunCommand(projectId: string): Promise<{ command: string; args: string[]; label: string } | null>
  runProject(projectId: string, command?: string, args?: string[]): Promise<{ status: string }>
  stopProject(): Promise<{ status: string }>
  isProjectRunning(): Promise<boolean>

  // Event listeners
  on(channel: string, callback: (...args: unknown[]) => void): () => void
}

interface Window {
  relayAPI: RelayAPI
}
