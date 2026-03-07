/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    APP_ROOT: string
    VITE_PUBLIC: string
  }
}

interface RelayAPI {
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
  checkCliAvailable(): Promise<{ available: boolean; error?: string }>

  // Project
  createProject(params: { name: string; path: string }): Promise<import('../shared/types').Project>
  openProject(path: string): Promise<import('../shared/types').Project | null>
  listProjects(): Promise<import('../shared/types').RecentProject[]>
  selectFolder(): Promise<string | null>

  // PRD
  generatePrd(description: string): Promise<unknown>
  decomposePrd(prdId: string): Promise<unknown>
  savePrd(prd: unknown): Promise<unknown>
  getPrd(projectId: string): Promise<import('../shared/types').PRD | null>

  // Tasks
  listTasks(projectId: string): Promise<import('../shared/types').Task[]>
  updateTask(taskId: string, updates: Partial<import('../shared/types').Task>): Promise<unknown>
  reorderTasks(tasks: unknown): Promise<unknown>

  // Agent Loop
  startLoop(projectId?: string): Promise<unknown>
  pauseLoop(): Promise<unknown>
  resumeLoop(): Promise<unknown>
  stopLoop(): Promise<unknown>

  // Git
  gitDiff(projectId: string): Promise<string>
  gitCommit(projectId: string, message: string): Promise<unknown>
  gitLog(projectId: string): Promise<unknown[]>
  gitStatus(projectId: string): Promise<{ clean: boolean; files: Array<{ path: string; insertions: number; deletions: number; status: 'new' | 'modified' | 'deleted' | 'renamed' }> }>

  // Review
  reviewGetDiff(projectId: string): Promise<string>
  reviewApprove(projectId: string, taskId: string, commitMessage: string): Promise<unknown>
  reviewReject(projectId: string, taskId: string, notes: string): Promise<unknown>

  // Metrics
  projectMetrics(projectId: string): Promise<unknown>
  taskMetrics(projectId: string): Promise<unknown>
  exportMetrics(projectId: string): Promise<unknown>

  // Event listeners
  on(channel: string, callback: (...args: unknown[]) => void): () => void
}

interface Window {
  relayAPI: RelayAPI
}
