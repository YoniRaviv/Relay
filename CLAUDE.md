# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Relay is a desktop app that turns Claude Code (or OpenAI Codex) into a visual Kanban build loop. Built with Electron + Vite + React + TypeScript. The core flow: describe a feature → AI generates a specification document (or brainstorm interactively) → decomposes into tasks → autonomous agent builds each task → human reviews via approve/reject gate. Supports three execution engines: Anthropic SDK (API key), Claude Code CLI, and OpenAI Codex CLI.

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

**Electron main process** (`electron/main.ts`): Creates BrowserWindow, registers all IPC handlers at startup via `registerAllHandlers()`, closes all DB connections and running processes on quit. In dev loads from Vite dev server; in production from `dist/index.html`.

**Preload script** (`electron/preload.ts`): Exposes `window.relayAPI` via contextBridge (~90+ methods). All IPC is async/promise-based — no synchronous calls.

**Renderer / React app** (`src/`): React 18 app. Entry: `src/main.tsx` → `src/App.tsx`. Uses Zustand for state, Tailwind CSS v4, shadcn/ui components. Frontend code is organized into feature-based modules under `src/modules/` with shared utilities in `src/shared/`.

### State Management (Zustand)

Single store in `src/store/useRelayStore.ts` with logical slices:
- **SettingsSlice**: auth status, recent projects
- **ProjectSlice**: active project
- **PRDSlice**: wizard step, wizard mode (`specification` | `brainstorm` | `manual`), feature description, PRD markdown, decomposed tasks, brainstorm session ID, brainstorm messages (with typed blocks)
- **TasksSlice**: Kanban tasks, selected task
- **AgentSlice**: loop state (`idle` | `running` | `paused` | `stopped`), current task, activity feed, loop PRD ID (per-feature tracking)
- **GitSlice**: current branch, branches
- **ReviewSlice**: task in review mode

No async actions in Zustand — side effects happen in components/handlers. `setPrdMarkdown()` accepts string or function (for streaming updates).

### Database Layer

Per-project SQLite at `<project>/.relay/relay.db` using better-sqlite3. Connection pooling by path in `electron/db/connection.ts` (same path returns same connection). WAL mode, foreign keys enforced.

**Tables**: `projects`, `prd` (with title, feature_branch, is_archived), `tasks` (with status/order/passes/rejectionNotes/dependsOn/commitHash), `task_logs`, `task_metrics`

Schema defined in `electron/db/schema.ts`. 8 versioned migrations.

### IPC Handlers

Organized by domain in `electron/ipc/`:
- **settings**: auth, API key (encrypted via `safeStorage`), engine mode, model selection, session mode, Codex CLI check
- **project**: create, open, list, select folder, scan, listFiles (for @ file tagging)
- **prd**: generate (streaming with project context), decompose (streaming), save, CRUD, rename, archive/unarchive, export
- **brainstorm**: start (non-streaming, returns structured JSON blocks), respond (non-streaming), finalize (streaming design doc), cleanup. Session state in main-process Map.
- **tasks**: list, update, reorder, create, delete, getLogs
- **agent**: loop start/pause/resume/stop
- **git**: diff, commit, log, status, branch, commitFiles (wraps simple-git)
- **review**: getDiff, approve (stages + commits), reject (resets to pending with notes)
- **runner**: detect run command, start/stop project, isRunning
- **metrics**: project aggregates, per-task stats, JSON export

**Streaming events** (main → renderer): `prd:stream`, `prd:status`, `prd:decomposeStream`, `brainstorm:message`, `brainstorm:stream`, `agent:activity`, `loop:stateChange`, `loop:taskChange`, `loop:tasksUpdated`, `project:stdout`, `project:stderr`, `project:processExit`

### AI Execution Engines

Three pluggable engines implementing `TaskEngine` interface (`electron/agent/engines/types.ts`):

1. **SDK Engine** (`sdkEngine.ts`): Uses `@anthropic-ai/sdk` directly. Streams messages with built-in tools (read_file, write_file, list_files). Tools are bounded to project directory.

2. **CLI Engine** (`cliEngine.ts`): Uses `@anthropic-ai/claude-agent-sdk` query function. Discovers `claude` CLI via `which`. Two tool presets: "conservative" (read/write/glob/grep/edit) and "full" (+ bash/web-fetch). Supports persistent sessions (`persistSession: true`) for 1M context across tasks.

3. **Codex Engine** (`codexEngine.ts`): Uses `@openai/codex-sdk`. Discovers `codex` CLI via `which`. Thread-based execution with `runStreamed()`. Maps Codex ThreadItem events (agent_message, command_execution, file_change, mcp_tool_call, reasoning, todo_list, error) to Relay's activity feed format.

Engine mode is selectable in UI and persisted in settings. Model auto-resets to a valid default when switching engines.

### Agent Loop (`electron/agent/loopController.ts`)

1. Clean stale git locks
2. Get next pending task (respecting dependency order)
3. Build cumulative context (completed tasks, modified files, pre-loaded source)
4. Engine.runTask() → streams logs → emits activity events
5. Create WIP commit to isolate changes
6. Route by build mode: review (pause for human), continuous (keep going), auto-pilot (auto-commit)
7. On failure: increment passes, 2s delay, retry or mark failed
8. Engine cleanup on loop end (`cleanupEngine()`)

### Data Flow

```
Setup (engine + project) → PRDWizard (3 modes: Specification [5 steps], Brainstorm [6 steps], Manual [3 steps])
→ Board (Kanban: Pending | Building | Review | Complete) → Agent Loop → Review Gate → Summary
```

### Kanban Board

Uses `@dnd-kit/core` for drag-and-drop. Four columns map to task statuses:
- **Pending**: `pending` — includes "Add Task" button
- **Building**: `in_progress`, `failed`
- **Human Review**: `review`
- **Complete**: `done`

Drag enforces valid status transitions. Keyboard shortcut: `Space` toggles loop, `Esc` closes panels.

### @ File Tagging

Users can reference project files with `@path/to/file` in feature descriptions and task descriptions:
- `FileAutocomplete` dropdown triggered by `@` in any textarea (debounced 150ms, keyboard navigation)
- `project:listFiles` IPC uses `git ls-files` with `readdirSync` fallback, 30s TTL cache
- `resolveFileReferences()` reads file contents (30KB/file, 100KB total) and injects into AI prompt
- `TextareaWithFileTag` reusable component wraps any textarea with @ autocomplete support

### Project Runner

Auto-detects run command from project config files (`.relay/run.json` override, then `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `docker-compose.yml`, `Makefile`). Spawns child process with stdout/stderr streaming. Play/stop toggle in board header with tabbed output panel.

### Cost Tracking

Centralized pricing in `shared/pricing.ts` with per-model token costs, tagged by engine (`anthropic` | `openai`). Models: Haiku 4.5, Sonnet 4/4.6, Opus 4.6 (Anthropic) + GPT-5.4, GPT-5.4 Mini, GPT-5.3 Codex, GPT-5.3 Codex Spark (OpenAI). Aggregated via SQL joins on `task_metrics` table.

### Frontend Module Structure

Components are organized into feature-based modules under `src/modules/`, each with a `components/` dir and barrel `index.ts`:

- **`src/modules/board/`** — KanbanBoard, KanbanColumn, TaskCard, TaskDetail, AddTaskButton, CompletedTaskSummary, ArchiveView, FeatureDetail, FormattedDescription
- **`src/modules/agent/`** — LoopControls, AgentActivityFeed, FeatureCompleteActions, RunProjectButton, RunOutputPanel, LinkifiedText, BuildTimer, ActionBlock, TextBlock
- **`src/modules/review/`** — ReviewPanel, FileChangeList, DiffViewer, CommitDialog, PrCreationDialog
- **`src/modules/prd/`** — PRDPreview, PRDEditor, FeatureInput, BrainstormChat, StepIndicator, TaskReview, TaskEditDialog, TaskReviewCard, FileAutocomplete, TextareaWithFileTag, StreamingProgress
- **`src/modules/settings/`** — SettingsView, ModelPicker, ThemeToggle
- **`src/modules/project/`** — ProjectSelector, ProjectSidebar, GitHistoryPanel
- **`src/modules/metrics/`** — TaskMetricsTable, MetricCard

Shared code lives in `src/shared/`:
- **`formatters/`** — `formatDuration`, `formatNumber`, `formatCost`, `extractTitle`
- **`constants/statusMaps.ts`** — `statusColors`, `statusLabels`, `statusDots`, `priorityTextColors`, `priorityBadgeColors`, `tierColors`
- **`hooks/`** — `useClickOutside`, `useIpcListener`
- **`types/`** — `ProjectMetrics`, `TaskMetricRow`, `FileChange`, `DecomposedTask`
- **`components/`** — AppShell, ErrorBoundary, LoadingSkeleton, EmptyState, BranchIndicator, CollapsibleSection, ProjectContextBadge

`src/components/ui/` contains only shadcn/ui primitives (unchanged).

## Key Patterns

- **Project path resolution**: Handlers look up project path from settings store by iterating recent projects — don't hardcode paths
- **Streaming UI**: Use `useIpcListener(event, handler, deps)` hook from `@/shared/hooks/useIpcListener` — it handles cleanup automatically
- **Shared types**: `shared/types.ts` used across Electron and React layers; `src/shared/types/` for renderer-only types (metrics, review, prd)
- **UI components**: shadcn/ui in `src/components/ui/`, feature components in `src/modules/<module>/`
- **Dev bypass**: `'dev-bypass'` API key accepted in dev mode for testing without real API
- **Engine isolation**: Each engine is in its own file (`sdkEngine.ts`, `cliEngine.ts`, `codexEngine.ts`). To disable an engine, remove its case from `getEngine()` in `engines/index.ts`.
- **safeSend pattern**: All IPC sends from main process use `safeSend()` which checks both `win.isDestroyed()` and `win.webContents.isDestroyed()` before sending.
- **File paths in activity feed**: Strip project path prefix — show `src/foo.ts` not `/Users/.../project/src/foo.ts`

### Import Conventions

- **Intra-module**: relative paths (`./KanbanColumn`)
- **Cross-module**: barrel via alias (`@/modules/agent`)
- **Shared utilities**: via alias (`@/shared/formatters`, `@/shared/constants/statusMaps`, or `@/shared`)
- **shadcn/ui**: `@/components/ui/button`
- **Electron shared types**: `@shared/types`, `@shared/pricing`

## Conventions
- **Indentation**: 4 spaces for all files in `src/modules/`, `src/shared/`, `src/pages/`
- **Component modularity**: Every distinct UI component must live in its own file under its module's `components/` directory. Do not define secondary components (>10 lines of JSX) inline in a parent component file. Small helpers (<10 lines, no state) like `SectionLabel` may stay inline. Utility/formatting functions go in a `utils/` file within the module.
