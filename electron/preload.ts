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

  // Project
  createProject: (params: { name: string; path: string }) => ipcRenderer.invoke('project:create', params),
  openProject: (path: string) => ipcRenderer.invoke('project:open', path),
  listProjects: () => ipcRenderer.invoke('project:list'),
  selectFolder: () => ipcRenderer.invoke('project:selectFolder'),
  scanProject: (projectId: string) => ipcRenderer.invoke('project:scan', projectId),
  getProjectContext: (projectId: string) => ipcRenderer.invoke('project:getContext', projectId),

  // PRD
  clarifyPrd: (description: string, projectContext?: string, attachments?: unknown[]) => ipcRenderer.invoke('prd:clarify', description, projectContext, attachments),
  generatePrd: (description: string, clarifications?: string, projectContext?: string, attachments?: unknown[]) => ipcRenderer.invoke('prd:generate', description, clarifications, projectContext, attachments),
  decomposePrd: (prdMarkdown: string, projectContext?: string) => ipcRenderer.invoke('prd:decompose', prdMarkdown, projectContext),
  savePrd: (prd: unknown) => ipcRenderer.invoke('prd:save', prd),
  getPrd: (projectId: string) => ipcRenderer.invoke('prd:get', projectId),
  listPrds: (projectId: string) => ipcRenderer.invoke('prd:list', projectId),
  deletePrd: (prdId: string) => ipcRenderer.invoke('prd:delete', prdId),

  // Tasks
  listTasks: (projectId: string, prdId?: string) => ipcRenderer.invoke('tasks:list', projectId, prdId),
  updateTask: (taskId: string, updates: unknown) => ipcRenderer.invoke('tasks:update', taskId, updates),
  reorderTasks: (tasks: unknown) => ipcRenderer.invoke('tasks:reorder', tasks),

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
  gitStash: (projectId: string) => ipcRenderer.invoke('git:stash', projectId),
  gitCreatePr: (projectId: string, title: string, body: string, baseBranch: string) => ipcRenderer.invoke('git:createPr', projectId, title, body, baseBranch),

  // Review
  reviewGetDiff: (projectId: string) => ipcRenderer.invoke('review:getDiff', projectId),
  reviewApprove: (projectId: string, taskId: string, commitMessage: string) => ipcRenderer.invoke('review:approve', projectId, taskId, commitMessage),
  reviewReject: (projectId: string, taskId: string, notes: string) => ipcRenderer.invoke('review:reject', projectId, taskId, notes),

  // Metrics
  projectMetrics: (projectId: string, prdId?: string) => ipcRenderer.invoke('metrics:project', projectId, prdId),
  taskMetrics: (projectId: string, prdId?: string) => ipcRenderer.invoke('metrics:tasks', projectId, prdId),
  exportMetrics: (projectId: string) => ipcRenderer.invoke('metrics:export', projectId),

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
