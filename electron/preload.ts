import { ipcRenderer, contextBridge } from 'electron'

const relayAPI = {
  // Settings
  checkAuth: () => ipcRenderer.invoke('cc:checkAuth'),
  setApiKey: (key: string) => ipcRenderer.invoke('cc:setApiKey', key),
  getApiKey: () => ipcRenderer.invoke('cc:getApiKey'),
  getSettings: () => ipcRenderer.invoke('cc:getSettings'),

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

  // Tasks
  listTasks: (projectId: string) => ipcRenderer.invoke('tasks:list', projectId),
  updateTask: (taskId: string, updates: unknown) => ipcRenderer.invoke('tasks:update', taskId, updates),
  reorderTasks: (tasks: unknown) => ipcRenderer.invoke('tasks:reorder', tasks),

  // Agent Loop
  startLoop: (projectId?: string) => ipcRenderer.invoke('loop:start', projectId),
  pauseLoop: () => ipcRenderer.invoke('loop:pause'),
  resumeLoop: () => ipcRenderer.invoke('loop:resume'),
  stopLoop: () => ipcRenderer.invoke('loop:stop'),

  // Git
  gitDiff: () => ipcRenderer.invoke('git:diff'),
  gitCommit: (message: string) => ipcRenderer.invoke('git:commit', message),
  gitLog: () => ipcRenderer.invoke('git:log'),
  gitStatus: () => ipcRenderer.invoke('git:status'),

  // Metrics
  projectMetrics: () => ipcRenderer.invoke('metrics:project'),
  taskMetrics: (taskId: string) => ipcRenderer.invoke('metrics:task', taskId),
  exportMetrics: () => ipcRenderer.invoke('metrics:export'),

  // Event listeners
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
}

contextBridge.exposeInMainWorld('relayAPI', relayAPI)
