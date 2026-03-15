# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Relay is a desktop app that turns Claude Code into a visual Kanban build loop. Built with Electron + Vite + React + TypeScript. The core flow: describe a feature → AI generates a PRD → decomposes into tasks → autonomous agent builds each task → human reviews via approve/reject gate.

## Commands

- `npm run dev` — Start Vite dev server with Electron (HMR enabled)
- `npm run build` — TypeScript check + Vite build + electron-builder package
- `npm run lint` — ESLint with zero warnings allowed
- `npm run preview` — Preview the Vite production build
- `npm run seed-demo` — Create demo project with sample PRD + tasks (useful for UI testing)

## Path Aliases

- `@/*` → `src/*`
- `@shared/*` → `shared/*`

## Architecture

### Process Model

**Electron main process** (`electron/main.ts`): Creates BrowserWindow, registers all IPC handlers at startup via `registerAllHandlers()`, closes all DB connections on quit. In dev loads from Vite dev server; in production from `dist/index.html`.

**Preload script** (`electron/preload.ts`): Exposes `window.relayAPI` via contextBridge. All IPC is async/promise-based — no synchronous calls.

**Renderer / React app** (`src/`): React 18 app. Entry: `src/main.tsx` → `src/App.tsx`. Uses Zustand for state, Tailwind CSS v4, shadcn/ui components. Frontend code is organized into feature-based modules under `src/modules/` with shared utilities in `src/shared/`.

### State Management (Zustand)

Single store in `src/store/useRelayStore.ts` with logical slices:
- **SettingsSlice**: auth status, recent projects
- **ProjectSlice**: active project
- **PRDSlice**: wizard step, feature description, PRD markdown, decomposed tasks
- **TasksSlice**: Kanban tasks, selected task
- **AgentSlice**: loop state (`idle` | `running` | `paused` | `stopped`), current task, activity feed
- **GitSlice**: current branch, branches
- **ReviewSlice**: task in review mode

No async actions in Zustand — side effects happen in components/handlers. `setPrdMarkdown()` accepts string or function (for streaming updates).

### Database Layer

Per-project SQLite at `<project>/.relay/relay.db` using better-sqlite3. Connection pooling by path in `electron/db/connection.ts` (same path returns same connection). WAL mode, foreign keys enforced.

**Tables**: `projects`, `prd`, `tasks` (with status/order/passes/rejectionNotes), `task_logs`, `task_metrics`

Schema defined in `electron/db/schema.ts`.

### IPC Handlers

Organized by domain in `electron/ipc/`:
- **settings**: auth, API key (encrypted via `safeStorage`), engine mode, model selection
- **project**: create, open, list, select folder
- **prd**: generate (streaming), decompose (streaming), save, CRUD
- **tasks**: list, update, reorder
- **agent**: loop start/pause/resume/stop
- **git**: diff, commit, log, status, branch (wraps simple-git)
- **review**: getDiff, approve (stages + commits), reject (resets to pending with notes)
- **metrics**: project aggregates, per-task stats, JSON export

**Streaming events** (main → renderer): `prd:stream`, `prd:status`, `prd:decomposeStream`, `agent:activity`, `loop:stateChange`, `loop:taskChange`, `loop:tasksUpdated`

### AI Execution Engines

Two pluggable engines implementing `TaskEngine` interface (`electron/agent/engines/types.ts`):

1. **SDK Engine** (`sdkEngine.ts`): Uses `@anthropic-ai/sdk` directly. Streams messages with built-in tools (read_file, write_file, list_files). Tools are bounded to project directory.

2. **CLI Engine** (`cliEngine.ts`): Uses `@anthropic-ai/claude-agent-sdk` query function. Discovers `claude` CLI via `which`. Two tool presets: "conservative" (read/write/glob/grep/edit) and "full" (+ bash/web-fetch).

Engine mode is selectable in UI and persisted in settings.

### Agent Loop (`electron/agent/loopController.ts`)

1. Get next pending task
2. Build prompt from task + PRD context (prompts in `electron/agent/prompts.ts`)
3. Engine.runTask() → streams logs → emits activity events
4. Task reaches 'review' status if code diff exists → auto-pauses for human approval
5. After approval → continues to next task

### Data Flow

```
Setup (API key + project) → PRDWizard (5 steps: input → preview → edit → task review → save)
→ Board (Kanban: Pending | Building | Complete) → Agent Loop → Review Gate → Summary
```

### Kanban Board

Uses `@dnd-kit/core` for drag-and-drop. Three columns map to task statuses:
- **Pending**: `pending`
- **Building**: `in_progress`, `review`, `failed`
- **Complete**: `done`, `approved`

Drag enforces valid status transitions. Keyboard shortcut: `Space` toggles loop, `Esc` closes panels.

### Cost Tracking

Centralized pricing in `shared/pricing.ts` with per-model token costs. Aggregated via SQL joins on `task_metrics` table. Displayed in Summary page with per-model breakdown.

### Frontend Module Structure

Components are organized into feature-based modules under `src/modules/`, each with a `components/` dir and barrel `index.ts`:

- **`src/modules/board/`** — KanbanBoard, KanbanColumn, TaskCard, TaskDetail, FormattedDescription
- **`src/modules/agent/`** — LoopControls, AgentActivityFeed, ActivityMessage, FeatureCompleteActions
- **`src/modules/review/`** — ReviewPanel, FileChangeList, DiffViewer, CommitDialog
- **`src/modules/prd/`** — PRDPreview, PRDEditor, FeatureInput, StepIndicator, TaskReview, TaskEditDialog, TaskReviewCard
- **`src/modules/settings/`** — SettingsView, ModelPicker, ApiKeyInput, ThemeToggle
- **`src/modules/project/`** — ProjectSelector, ProjectSummary, ProjectSidebar, GitHistoryPanel
- **`src/modules/metrics/`** — TaskMetricsTable, MetricCard

Shared code lives in `src/shared/`:
- **`formatters/`** — `formatDuration`, `formatNumber`, `formatCost`
- **`constants/statusMaps.ts`** — `statusColors`, `statusLabels`, `statusDots`, `priorityTextColors`, `priorityBadgeColors`, `tierColors`
- **`hooks/`** — `useClickOutside`, `useIpcListener`
- **`types/`** — `ProjectMetrics`, `TaskMetricRow`, `FileChange`, `DecomposedTask`
- **`components/`** — AppShell, ErrorBoundary, LoadingSkeleton, EmptyState, StreamingText, BranchIndicator, CollapsibleSection

`src/components/ui/` contains only shadcn/ui primitives (unchanged).

## Key Patterns

- **Project path resolution**: Handlers look up project path from settings store by iterating recent projects — don't hardcode paths
- **Streaming UI**: Use `useIpcListener(event, handler, deps)` hook from `@/shared/hooks/useIpcListener` — it handles cleanup automatically
- **Shared types**: `shared/types.ts` used across Electron and React layers; `src/shared/types/` for renderer-only types (metrics, review, prd)
- **UI components**: shadcn/ui in `src/components/ui/`, feature components in `src/modules/<module>/`
- **Dev bypass**: `'dev-bypass'` API key accepted in dev mode for testing without real API

### Import Conventions

- **Intra-module**: relative paths (`./KanbanColumn`)
- **Cross-module**: barrel via alias (`@/modules/agent`)
- **Shared utilities**: via alias (`@/shared/formatters`, `@/shared/constants/statusMaps`, or `@/shared`)
- **shadcn/ui**: `@/components/ui/button`
- **Electron shared types**: `@shared/types`, `@shared/pricing`

## Conventions
- **Indentation**: 4 spaces for all files in `src/modules/`, `src/shared/`, `src/pages/`
- **Component modularity**: Every distinct UI component must live in its own file under its module's `components/` directory. Do not define secondary components (>10 lines of JSX) inline in a parent component file. Small helpers (<10 lines, no state) like `SectionLabel` may stay inline. Utility/formatting functions go in a `utils/` file within the module.
