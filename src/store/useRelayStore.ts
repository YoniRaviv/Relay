import { create } from 'zustand';
import type {
  Project,
  PRD,
  Task,
  TaskLog,
  AuthStatus,
  RecentProject,
  LoopState,
  BuildMode,
  ImageAttachment,
  WizardMode,
  BrainstormMessage,
  BrainstormBlock,
  ReviewSession,
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
  projectContext: string | null;
  scanningProject: boolean;
  setActiveProject: (project: Project | null) => void;
  setProjectContext: (context: string | null) => void;
  setScanningProject: (scanning: boolean) => void;
}

// ── Feature (PRD) Summary ──
export interface FeatureSummary extends PRD {
  taskCount: number;
  doneCount: number;
}

// ── PRD Slice ──
interface PRDSlice {
  wizardStep: number;
  wizardMode: WizardMode;
  featureName: string;
  featureDescription: string;
  prdMarkdown: string;
  prd: PRD | null;
  activePrdId: string | null;
  features: FeatureSummary[];
  decomposedTasks: Task[];
  featureAttachments: ImageAttachment[];
  includeTests: boolean;
  brainstormSessionId: string | null;
  brainstormMessages: BrainstormMessage[];
  setWizardStep: (step: number) => void;
  setWizardMode: (mode: WizardMode) => void;
  setFeatureName: (name: string) => void;
  setIncludeTests: (include: boolean) => void;
  setFeatureDescription: (desc: string) => void;
  setPrdMarkdown: (md: string | ((prev: string) => string)) => void;
  setPrd: (prd: PRD | null) => void;
  setActivePrdId: (id: string | null) => void;
  setFeatures: (features: FeatureSummary[]) => void;
  archivedFeatures: FeatureSummary[];
  setArchivedFeatures: (features: FeatureSummary[]) => void;
  setDecomposedTasks: (tasks: Task[]) => void;
  setFeatureAttachments: (attachments: ImageAttachment[]) => void;
  addFeatureAttachment: (attachment: ImageAttachment) => void;
  removeFeatureAttachment: (id: string) => void;
  setBrainstormSessionId: (id: string | null) => void;
  addBrainstormMessage: (msg: BrainstormMessage) => void;
  updateLastBrainstormMessage: (content: string | ((prev: string) => string)) => void;
  setLastBrainstormBlock: (block: BrainstormBlock) => void;
  clearBrainstormState: () => void;
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
  loopPrdId: string | null;  // which feature the loop is running for
  currentTaskId: string | null;
  activityFeed: TaskLog[];
  buildStartTime: string | null;
  buildMode: BuildMode;
  setLoopState: (state: LoopState) => void;
  setLoopPrdId: (prdId: string | null) => void;
  setCurrentTaskId: (id: string | null) => void;
  addActivity: (log: TaskLog) => void;
  clearActivity: () => void;
  setBuildStartTime: (time: string | null) => void;
  setBuildMode: (mode: BuildMode) => void;
}

// ── Git Slice ──
interface GitSlice {
  currentBranch: string | null;
  branches: string[];
  featureBranch: string | null;
  baseBranch: string | null;
  prUrl: string | null;
  setCurrentBranch: (branch: string | null) => void;
  setBranches: (branches: string[]) => void;
  setFeatureBranch: (branch: string | null) => void;
  setBaseBranch: (branch: string | null) => void;
  setPrUrl: (url: string | null) => void;
}

// ── Review Slice ──
interface ReviewSlice {
  reviewingTaskId: string | null;
  setReviewingTaskId: (id: string | null) => void;
}

// ── Review Agent Slice ──
interface ReviewAgentSlice {
  reviewSession: ReviewSession | null;
  reviewAgentState: 'idle' | 'analyzing' | 'findings' | 'fixing' | 'complete';
  reviewProgress: string;
  setReviewSession: (session: ReviewSession | null) => void;
  setReviewAgentState: (state: ReviewAgentSlice['reviewAgentState']) => void;
  setReviewProgress: (text: string) => void;
}

// ── Combined Store ──
export type RelayStore = SettingsSlice & ProjectSlice & PRDSlice & TasksSlice & AgentSlice & GitSlice & ReviewSlice & ReviewAgentSlice;

export const useRelayStore = create<RelayStore>((set) => ({
  // Settings
  authStatus: { valid: false },
  recentProjects: [],
  setAuthStatus: (authStatus) => set({ authStatus }),
  setRecentProjects: (recentProjects) => set({ recentProjects }),

  // Project
  activeProject: null,
  projectContext: null,
  scanningProject: false,
  setActiveProject: (activeProject) => set({ activeProject }),
  setProjectContext: (projectContext) => set({ projectContext }),
  setScanningProject: (scanningProject) => set({ scanningProject }),

  // PRD
  wizardStep: 0,
  wizardMode: 'specification',
  featureName: '',
  featureDescription: '',
  prdMarkdown: '',
  prd: null,
  activePrdId: null,
  features: [],
  decomposedTasks: [],
  featureAttachments: [],
  includeTests: false,
  brainstormSessionId: null,
  brainstormMessages: [],
  setWizardStep: (wizardStep) => set({ wizardStep }),
  setWizardMode: (wizardMode) => set({ wizardMode }),
  setFeatureName: (featureName) => set({ featureName }),
  setIncludeTests: (includeTests) => set({ includeTests }),
  setFeatureDescription: (featureDescription) => set({ featureDescription }),
  setPrdMarkdown: (prdMarkdown) =>
    set((state) => ({
      prdMarkdown: typeof prdMarkdown === 'function' ? prdMarkdown(state.prdMarkdown) : prdMarkdown,
    })),
  setPrd: (prd) => set({ prd }),
  setActivePrdId: (activePrdId) => set({ activePrdId }),
  setFeatures: (features) => set({ features }),
  archivedFeatures: [],
  setArchivedFeatures: (archivedFeatures) => set({ archivedFeatures }),
  setDecomposedTasks: (decomposedTasks) => set({ decomposedTasks }),
  setFeatureAttachments: (featureAttachments) => set({ featureAttachments }),
  addFeatureAttachment: (attachment) =>
    set((state) => ({ featureAttachments: [...state.featureAttachments, attachment] })),
  removeFeatureAttachment: (id) =>
    set((state) => ({ featureAttachments: state.featureAttachments.filter((a) => a.id !== id) })),
  setBrainstormSessionId: (brainstormSessionId) => set({ brainstormSessionId }),
  addBrainstormMessage: (msg) =>
    set((state) => ({ brainstormMessages: [...state.brainstormMessages, msg] })),
  updateLastBrainstormMessage: (content) =>
    set((state) => {
      const msgs = [...state.brainstormMessages];
      const last = msgs[msgs.length - 1];
      if (!last) return state;
      msgs[msgs.length - 1] = {
        ...last,
        content: typeof content === 'function' ? content(last.content) : content,
      };
      return { brainstormMessages: msgs };
    }),
  setLastBrainstormBlock: (block) =>
    set((state) => {
      const msgs = [...state.brainstormMessages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          msgs[i] = { ...msgs[i], block };
          break;
        }
      }
      return { brainstormMessages: msgs };
    }),
  clearBrainstormState: () => set({ brainstormSessionId: null, brainstormMessages: [], wizardMode: 'specification' }),

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
  loopPrdId: null,
  currentTaskId: null,
  activityFeed: [],
  buildStartTime: null,
  buildMode: 'review',
  setLoopState: (loopState) => set({ loopState }),
  setLoopPrdId: (loopPrdId) => set({ loopPrdId }),
  setCurrentTaskId: (currentTaskId) => set({ currentTaskId }),
  addActivity: (log) =>
    set((state) => {
      const feed = state.activityFeed;
      // Cap at 2000 entries to prevent OOM on large builds
      const MAX_ACTIVITY = 2000;
      if (feed.length >= MAX_ACTIVITY) {
        // Drop the oldest 25% when hitting the cap
        const trimmed = feed.slice(Math.floor(MAX_ACTIVITY * 0.25));
        return { activityFeed: [...trimmed, log] };
      }
      return { activityFeed: [...feed, log] };
    }),
  clearActivity: () => set({ activityFeed: [] }),
  setBuildStartTime: (buildStartTime) => set({ buildStartTime }),
  setBuildMode: (buildMode) => set({ buildMode }),

  // Git
  currentBranch: null,
  branches: [],
  featureBranch: null,
  baseBranch: null,
  prUrl: null,
  setCurrentBranch: (currentBranch) => set({ currentBranch }),
  setBranches: (branches) => set({ branches }),
  setFeatureBranch: (featureBranch) => set({ featureBranch }),
  setBaseBranch: (baseBranch) => set({ baseBranch }),
  setPrUrl: (prUrl) => set({ prUrl }),

  // Review
  reviewingTaskId: null,
  setReviewingTaskId: (reviewingTaskId) => set({ reviewingTaskId }),

  // Review Agent
  reviewSession: null,
  reviewAgentState: 'idle',
  reviewProgress: '',
  setReviewSession: (reviewSession) => set({ reviewSession }),
  setReviewAgentState: (reviewAgentState) => set({ reviewAgentState }),
  setReviewProgress: (reviewProgress) => set({ reviewProgress }),
}));
