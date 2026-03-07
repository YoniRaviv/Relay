import { ipcRenderer, contextBridge } from 'electron'

const relayAPI = {
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

  // Project
  createProject: (params: { name: string; path: string }) => ipcRenderer.invoke('project:create', params),
  openProject: (path: string) => ipcRenderer.invoke('project:open', path),
  listProjects: () => ipcRenderer.invoke('project:list'),
  selectFolder: () => ipcRenderer.invoke('project:selectFolder'),

  // PRD
  generatePrd: (description: string) => ipcRenderer.invoke('prd:generate', description),
  decomposePrd: (prdId: string) => ipcRenderer.invoke('prd:decompose', prdId),
  savePrd: (prd: unknown) => ipcRenderer.invoke('prd:save', prd),
  getPrd: (projectId: string) => ipcRenderer.invoke('prd:get', projectId),
  listPrds: (projectId: string) => ipcRenderer.invoke('prd:list', projectId),
  deletePrd: (prdId: string) => ipcRenderer.invoke('prd:delete', prdId),

  // Tasks
  listTasks: (projectId: string, prdId?: string) => ipcRenderer.invoke('tasks:list', projectId, prdId),
  updateTask: (taskId: string, updates: unknown) => ipcRenderer.invoke('tasks:update', taskId, updates),
  reorderTasks: (tasks: unknown) => ipcRenderer.invoke('tasks:reorder', tasks),

  // Agent Loop
  startLoop: (projectId?: string, prdId?: string) => ipcRenderer.invoke('loop:start', projectId, prdId),
  pauseLoop: () => ipcRenderer.invoke('loop:pause'),
  resumeLoop: () => ipcRenderer.invoke('loop:resume'),
  stopLoop: () => ipcRenderer.invoke('loop:stop'),

  // Git
  gitDiff: (projectId: string) => ipcRenderer.invoke('git:diff', projectId),
  gitCommit: (projectId: string, message: string) => ipcRenderer.invoke('git:commit', projectId, message),
  gitLog: (projectId: string) => ipcRenderer.invoke('git:log', projectId),
  gitStatus: (projectId: string) => ipcRenderer.invoke('git:status', projectId),
  gitBranch: (projectId: string) => ipcRenderer.invoke('git:branch', projectId),

  // Review
  reviewGetDiff: (projectId: string) => ipcRenderer.invoke('review:getDiff', projectId),
  reviewApprove: (projectId: string, taskId: string, commitMessage: string) => ipcRenderer.invoke('review:approve', projectId, taskId, commitMessage),
  reviewReject: (projectId: string, taskId: string, notes: string) => ipcRenderer.invoke('review:reject', projectId, taskId, notes),

  // Metrics
  projectMetrics: (projectId: string) => ipcRenderer.invoke('metrics:project', projectId),
  taskMetrics: (projectId: string) => ipcRenderer.invoke('metrics:tasks', projectId),
  exportMetrics: (projectId: string) => ipcRenderer.invoke('metrics:export', projectId),

  // Event listeners
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
}

contextBridge.exposeInMainWorld('relayAPI', relayAPI)
