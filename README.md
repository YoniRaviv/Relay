<p align="center">
  <img src="public/icon.png" alt="Relay" width="120" height="120" />
</p>

<h1 align="center">Relay</h1>

<p align="center">
  A desktop app that turns Claude into a visual Kanban build loop.<br/>
  Describe a feature, review the generated plan, and watch it get built task by task.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue" alt="Platform" />
  <img src="https://img.shields.io/badge/electron-30-teal" alt="Electron" />
  <img src="https://img.shields.io/badge/react-18-61dafb" alt="React" />
  <img src="https://img.shields.io/badge/typescript-strict-blue" alt="TypeScript" />
</p>

---

## How It Works

1. **Enter your Anthropic API key** and open (or create) a project folder
2. **Describe a feature** in plain English
3. **Claude generates a PRD** (Product Requirements Document) — review and edit it
4. **Tasks are decomposed** into a structured backlog on a Kanban board
5. **The agent builds each task** autonomously using Claude, streaming progress in real time
6. **Review the diff** for each completed task — approve to commit, or reject with notes to retry
7. **Track metrics** — cost, tokens, build time, and first-pass success rate

## Features

- **PRD Wizard** — AI-generated product specs with streaming preview and manual editing
- **Kanban Board** — Drag-and-drop task management across Pending, Building, and Complete columns
- **Agent Loop** — Autonomous code generation with play/pause/stop controls
- **Human Review Gate** — Syntax-highlighted diff viewer with approve/reject flow and git integration
- **Metrics Dashboard** — Per-task and aggregate stats including cost tracking (Sonnet 4 & Opus 4.6 pricing)
- **Dark / Light Mode** — Toggle in sidebar, respects system preference by default
- **Keyboard Shortcuts** — `Space` to toggle the agent loop, `Esc` to close panels
- **Toast Notifications** — Real-time feedback for agent events, errors, and task completion
- **Per-Project SQLite** — All data stored locally in `.relay/relay.db` inside your project folder

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 30 |
| Frontend | React 18, TypeScript, Tailwind CSS v4, shadcn/ui |
| State | Zustand |
| AI | Anthropic Claude (via `@anthropic-ai/sdk`) |
| Database | better-sqlite3 (per-project) |
| Git | simple-git |
| Build | Vite, electron-builder |

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- An [Anthropic API key](https://console.anthropic.com/)

### Install

```bash
git clone https://github.com/YoniRaviv/Relay.git
cd Relay
npm install
```

### Development

```bash
npm run dev
```

Opens the app with Vite HMR. The Electron main process and preload script are compiled alongside the renderer.

#### Dev bypass (no API key needed)

In dev mode, enter **`dev-bypass`** as the API key to skip real API validation. You can also seed a demo project with sample data:

```bash
npx tsx scripts/seed-demo.ts
```

Then launch the app, enter `dev-bypass` as the key, and select the "Demo Project" to explore the UI with pre-populated tasks.

### Build

```bash
npm run build
```

Produces a packaged application in `release/` (`.dmg` on macOS, `.exe` on Windows, `.AppImage` on Linux).

### Lint

```bash
npm run lint
```

## Project Structure

```
electron/
  main.ts              # Electron main process
  preload.ts           # Context bridge (relayAPI)
  agent/               # Claude agent runner, prompts, loop controller
  db/                  # SQLite connection and schema
  ipc/                 # IPC handlers (settings, project, prd, tasks, agent, git, review, metrics)
shared/
  types.ts             # Shared TypeScript interfaces
  pricing.ts           # Model pricing table for cost calculation
src/
  pages/               # Board, PRDWizard, Setup, Summary
  modules/             # Feature-based component modules
    board/             # KanbanBoard, KanbanColumn, TaskCard, TaskDetail
    agent/             # LoopControls, AgentActivityFeed, ActivityMessage
    review/            # ReviewPanel, DiffViewer, FileChangeList, CommitDialog
    prd/               # PRDPreview, PRDEditor, FeatureInput, StepIndicator, TaskReview
    settings/          # SettingsView, ModelPicker, ApiKeyInput, ThemeToggle
    project/           # ProjectSelector, ProjectSummary, ProjectSidebar
    metrics/           # TaskMetricsTable, MetricCard
  shared/              # Reusable utilities, hooks, types, and components
    formatters/        # formatDuration, formatNumber, formatCost
    constants/         # Status color maps, priority colors, tier colors
    hooks/             # useClickOutside, useIpcListener
    types/             # Renderer-only shared types (metrics, review, prd)
    components/        # AppShell, ErrorBoundary, LoadingSkeleton, EmptyState, etc.
  components/ui/       # shadcn/ui primitives
  store/               # Zustand store
  lib/                 # Utilities (theme, keyboard shortcuts)
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause the agent loop |
| `Esc` | Close the active panel (review or task detail) |

## Roadmap

Planned features and improvements:

- [ ] **Summary PDF Export** — Export project summaries (PRD, tasks, metrics) as a downloadable PDF
- [ ] **Project Map** — Visual graph of file links, dependencies, and data flows across the codebase
- [ ] **App Observability** — Built-in error tracking, diagnostics, and logging dashboard for debugging issues
- [x] **Cleanup** — Split big components into smaller files, check for warnings and errors, check repeated code

## License

MIT
