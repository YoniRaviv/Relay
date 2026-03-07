import { create } from 'zustand';
import type {
  Project,
  PRD,
  Task,
  TaskLog,
  AuthStatus,
  RecentProject,
  LoopState,
} from '../../shared/types';

// ── Settings Slice ──
interface SettingsSlice {
  authStatus: AuthStatus;
  recentProjects: RecentProject[];
  setAuthStatus: (status: AuthStatus) => void;
  setRecentProjects: (projects: RecentProject[]) => void;
}

// ── Project Slice ──
interface ProjectSlice {
  activeProject: Project | null;
  setActiveProject: (project: Project | null) => void;
}

// ── Feature (PRD) Summary ──
export interface FeatureSummary extends PRD {
  taskCount: number;
  doneCount: number;
}

// ── PRD Slice ──
interface PRDSlice {
  wizardStep: number;
  featureDescription: string;
  prdMarkdown: string;
  prd: PRD | null;
  activePrdId: string | null;
  features: FeatureSummary[];
  decomposedTasks: Task[];
  setWizardStep: (step: number) => void;
  setFeatureDescription: (desc: string) => void;
  setPrdMarkdown: (md: string | ((prev: string) => string)) => void;
  setPrd: (prd: PRD | null) => void;
  setActivePrdId: (id: string | null) => void;
  setFeatures: (features: FeatureSummary[]) => void;
  setDecomposedTasks: (tasks: Task[]) => void;
}

// ── Tasks Slice ──
interface TasksSlice {
  tasks: Task[];
  selectedTaskId: string | null;
  setTasks: (tasks: Task[]) => void;
  setSelectedTaskId: (id: string | null) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
}

// ── Agent Slice ──
interface AgentSlice {
  loopState: LoopState;
  currentTaskId: string | null;
  activityFeed: TaskLog[];
  setLoopState: (state: LoopState) => void;
  setCurrentTaskId: (id: string | null) => void;
  addActivity: (log: TaskLog) => void;
  clearActivity: () => void;
}

// ── Git Slice ──
interface GitSlice {
  currentBranch: string | null;
  branches: string[];
  setCurrentBranch: (branch: string | null) => void;
  setBranches: (branches: string[]) => void;
}

// ── Review Slice ──
interface ReviewSlice {
  reviewingTaskId: string | null;
  setReviewingTaskId: (id: string | null) => void;
}

// ── Combined Store ──
export type RelayStore = SettingsSlice & ProjectSlice & PRDSlice & TasksSlice & AgentSlice & GitSlice & ReviewSlice;

export const useRelayStore = create<RelayStore>((set) => ({
  // Settings
  authStatus: { valid: false },
  recentProjects: [],
  setAuthStatus: (authStatus) => set({ authStatus }),
  setRecentProjects: (recentProjects) => set({ recentProjects }),

  // Project
  activeProject: null,
  setActiveProject: (activeProject) => set({ activeProject }),

  // PRD
  wizardStep: 0,
  featureDescription: '',
  prdMarkdown: '',
  prd: null,
  activePrdId: null,
  features: [],
  decomposedTasks: [],
  setWizardStep: (wizardStep) => set({ wizardStep }),
  setFeatureDescription: (featureDescription) => set({ featureDescription }),
  setPrdMarkdown: (prdMarkdown) =>
    set((state) => ({
      prdMarkdown: typeof prdMarkdown === 'function' ? prdMarkdown(state.prdMarkdown) : prdMarkdown,
    })),
  setPrd: (prd) => set({ prd }),
  setActivePrdId: (activePrdId) => set({ activePrdId }),
  setFeatures: (features) => set({ features }),
  setDecomposedTasks: (decomposedTasks) => set({ decomposedTasks }),

  // Tasks
  tasks: [],
  selectedTaskId: null,
  setTasks: (tasks) => set({ tasks }),
  setSelectedTaskId: (selectedTaskId) => set({ selectedTaskId }),
  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  // Agent
  loopState: 'idle',
  currentTaskId: null,
  activityFeed: [],
  setLoopState: (loopState) => set({ loopState }),
  setCurrentTaskId: (currentTaskId) => set({ currentTaskId }),
  addActivity: (log) =>
    set((state) => ({ activityFeed: [...state.activityFeed, log] })),
  clearActivity: () => set({ activityFeed: [] }),

  // Git
  currentBranch: null,
  branches: [],
  setCurrentBranch: (currentBranch) => set({ currentBranch }),
  setBranches: (branches) => set({ branches }),

  // Review
  reviewingTaskId: null,
  setReviewingTaskId: (reviewingTaskId) => set({ reviewingTaskId }),
}));
