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
  gitDiff(): Promise<string>
  gitCommit(message: string): Promise<unknown>
  gitLog(): Promise<unknown[]>
  gitStatus(): Promise<{ clean: boolean; files: string[] }>

  // Metrics
  projectMetrics(): Promise<unknown>
  taskMetrics(taskId: string): Promise<unknown>
  exportMetrics(): Promise<unknown>

  // Event listeners
  on(channel: string, callback: (...args: unknown[]) => void): () => void
}

interface Window {
  relayAPI: RelayAPI
}
