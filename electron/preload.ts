import { ipcRenderer, contextBridge } from 'electron'

const relayAPI = {
  // App info
  getAppInfo: () => ipcRenderer.invoke('cc:getAppInfo'),

  // Settings
  checkAuth: () => ipcRenderer.invoke('cc:checkAuth'),
  setApiKey: (key: string) => ipcRenderer.invoke('cc:setApiKey', key),
  getApiKey: () => ipcRenderer.invoke('cc:getApiKey'),
  getSettings: () => ipcRenderer.invoke('cc:getSettings'),

  // Engine
  getEngineMode: () => ipcRenderer.invoke('cc:getEngineMode'),
  setEngineMode: (mode: string) => ipcRenderer.invoke('cc:setEngineMode', mode),
  getCliToolsPreset: () => ipcRenderer.invoke('cc:getCliToolsPreset'),
  setCliToolsPreset: (preset: string) => ipcRenderer.invoke('cc:setCliToolsPreset', preset),
  checkCliAvailable: () => ipcRenderer.invoke('cc:checkCliAvailable'),
  checkCodexAvailable: () => ipcRenderer.invoke('cc:checkCodexAvailable'),
  getSelectedModel: () => ipcRenderer.invoke('cc:getSelectedModel'),
  setSelectedModel: (model: string) => ipcRenderer.invoke('cc:setSelectedModel', model),
  getMaxPasses: () => ipcRenderer.invoke('cc:getMaxPasses'),
  setMaxPasses: (max: number) => ipcRenderer.invoke('cc:setMaxPasses', max),
  getBuildMode: () => ipcRenderer.invoke('cc:getBuildMode'),
  setBuildMode: (mode: string) => ipcRenderer.invoke('cc:setBuildMode', mode),
  getCommitPrefix: () => ipcRenderer.invoke('cc:getCommitPrefix'),
  setCommitPrefix: (prefix: string) => ipcRenderer.invoke('cc:setCommitPrefix', prefix),
  getNotificationsEnabled: () => ipcRenderer.invoke('cc:getNotificationsEnabled'),
  setNotificationsEnabled: (enabled: boolean) => ipcRenderer.invoke('cc:setNotificationsEnabled', enabled),
  getSessionMode: () => ipcRenderer.invoke('cc:getSessionMode'),
  setSessionMode: (mode: string) => ipcRenderer.invoke('cc:setSessionMode', mode),

  // Project
  createProject: (params: { name: string; path: string }) => ipcRenderer.invoke('project:create', params),
  openProject: (path: string) => ipcRenderer.invoke('project:open', path),
  listProjects: () => ipcRenderer.invoke('project:list'),
  selectFolder: () => ipcRenderer.invoke('project:selectFolder'),
  scanProject: (projectId: string) => ipcRenderer.invoke('project:scan', projectId),
  getProjectContext: (projectId: string) => ipcRenderer.invoke('project:getContext', projectId),
  listProjectFiles: (projectId: string, query?: string) => ipcRenderer.invoke('project:listFiles', projectId, query),

  // PRD
  clarifyPrd: (projectId: string, description: string, projectContext?: string, attachments?: unknown[]) => ipcRenderer.invoke('prd:clarify', projectId, description, projectContext, attachments),
  generatePrd: (projectId: string, description: string, clarifications?: string, projectContext?: string, attachments?: unknown[]) => ipcRenderer.invoke('prd:generate', projectId, description, clarifications, projectContext, attachments),
  decomposePrd: (projectId: string, prdMarkdown: string, projectContext?: string) => ipcRenderer.invoke('prd:decompose', projectId, prdMarkdown, projectContext),
  savePrd: (prd: unknown) => ipcRenderer.invoke('prd:save', prd),
  renamePrd: (prdId: string, title: string) => ipcRenderer.invoke('prd:rename', prdId, title),
  getPrd: (projectId: string) => ipcRenderer.invoke('prd:get', projectId),
  listPrds: (projectId: string) => ipcRenderer.invoke('prd:list', projectId),
  deletePrd: (prdId: string) => ipcRenderer.invoke('prd:delete', prdId),
  prdSetFeatureBranch: (prdId: string, branch: string) => ipcRenderer.invoke('prd:setFeatureBranch', prdId, branch),
  prdExportMarkdown: (projectId: string, prdId: string) => ipcRenderer.invoke('prd:exportMarkdown', projectId, prdId),
  archiveFeature: (prdId: string) => ipcRenderer.invoke('prd:archive', prdId),
  unarchiveFeature: (prdId: string) => ipcRenderer.invoke('prd:unarchive', prdId),
  listArchivedFeatures: (projectId: string) => ipcRenderer.invoke('prd:listArchived', projectId),

  // Tasks
  listTasks: (projectId: string, prdId?: string) => ipcRenderer.invoke('tasks:list', projectId, prdId),
  updateTask: (taskId: string, updates: unknown) => ipcRenderer.invoke('tasks:update', taskId, updates),
  reorderTasks: (tasks: unknown) => ipcRenderer.invoke('tasks:reorder', tasks),
  createTask: (params: { projectId: string; prdId: string; title: string; description: string; acceptanceCriteria: string; priority: string }) => ipcRenderer.invoke('tasks:create', params),
  deleteTask: (taskId: string) => ipcRenderer.invoke('tasks:delete', taskId),
  getTaskLogs: (taskId: string) => ipcRenderer.invoke('tasks:getLogs', taskId),

  // Agent Loop
  startLoop: (projectId?: string, prdId?: string, buildMode?: string) => ipcRenderer.invoke('loop:start', projectId, prdId, buildMode),
  pauseLoop: () => ipcRenderer.invoke('loop:pause'),
  resumeLoop: () => ipcRenderer.invoke('loop:resume'),
  stopLoop: () => ipcRenderer.invoke('loop:stop'),

  // Git
  gitDiff: (projectId: string) => ipcRenderer.invoke('git:diff', projectId),
  gitCommit: (projectId: string, message: string) => ipcRenderer.invoke('git:commit', projectId, message),
  gitLog: (projectId: string) => ipcRenderer.invoke('git:log', projectId),
  gitStatus: (projectId: string) => ipcRenderer.invoke('git:status', projectId),
  gitBranch: (projectId: string) => ipcRenderer.invoke('git:branch', projectId),
  gitCheckout: (projectId: string, branch: string) => ipcRenderer.invoke('git:checkout', projectId, branch),
  gitPull: (projectId: string) => ipcRenderer.invoke('git:pull', projectId),
  gitCreateBranch: (projectId: string, branchName: string, baseBranch: string) => ipcRenderer.invoke('git:createBranch', projectId, branchName, baseBranch),
  gitPush: (projectId: string) => ipcRenderer.invoke('git:push', projectId),
  gitStash: (projectId: string, message?: string) => ipcRenderer.invoke('git:stash', projectId, message),
  gitStashPop: (projectId: string, branch?: string) => ipcRenderer.invoke('git:stashPop', projectId, branch),
  gitCreatePr: (projectId: string, title: string, body: string, baseBranch: string) => ipcRenderer.invoke('git:createPr', projectId, title, body, baseBranch),
  gitAddRemote: (projectId: string, url: string) => ipcRenderer.invoke('git:addRemote', projectId, url),
  gitHasRemote: (projectId: string) => ipcRenderer.invoke('git:hasRemote', projectId),
  gitGetPrUrl: (projectId: string) => ipcRenderer.invoke('git:getPrUrl', projectId),
  gitCheckInit: (projectId: string) => ipcRenderer.invoke('git:checkInit', projectId),
  gitInit: (projectId: string) => ipcRenderer.invoke('git:init', projectId),
  gitEnsureGitignore: (projectId: string) => ipcRenderer.invoke('git:ensureGitignore', projectId),
  gitCommitFiles: (projectId: string, commitHash: string) => ipcRenderer.invoke('git:commitFiles', projectId, commitHash),

  // Review
  reviewGetDiff: (projectId: string, taskId?: string) => ipcRenderer.invoke('review:getDiff', projectId, taskId),
  reviewApprove: (projectId: string, taskId: string, commitMessage: string) => ipcRenderer.invoke('review:approve', projectId, taskId, commitMessage),
  reviewReject: (projectId: string, taskId: string, notes: string) => ipcRenderer.invoke('review:reject', projectId, taskId, notes),

  // Metrics
  projectMetrics: (projectId: string, prdId?: string) => ipcRenderer.invoke('metrics:project', projectId, prdId),
  taskMetrics: (projectId: string, prdId?: string) => ipcRenderer.invoke('metrics:tasks', projectId, prdId),
  exportMetrics: (projectId: string) => ipcRenderer.invoke('metrics:export', projectId),

  // Runner
  detectRunCommand: (projectId: string) => ipcRenderer.invoke('runner:detect', projectId),
  runProject: (projectId: string, command?: string, args?: string[]) => ipcRenderer.invoke('runner:start', projectId, command, args),
  stopProject: () => ipcRenderer.invoke('runner:stop'),
  isProjectRunning: () => ipcRenderer.invoke('runner:isRunning'),

  // Updater
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),

  // Event listeners
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
}

contextBridge.exposeInMainWorld('relayAPI', relayAPI)
