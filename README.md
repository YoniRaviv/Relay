<p align="center">
  <img src="public/icon.png" alt="Relay" width="120" height="120" />
</p>

<h1 align="center">Relay</h1>

<p align="center">
  Turn Claude Code into a visual Kanban build loop.<br/>
  Describe a feature → AI generates a PRD → decomposes into tasks → autonomous agent builds each task → you review via approve/reject gate.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue" alt="Platform" />
  <img src="https://img.shields.io/badge/electron-30-teal" alt="Electron" />
  <img src="https://img.shields.io/badge/react-18-61dafb" alt="React" />
  <img src="https://img.shields.io/badge/typescript-strict-blue" alt="TypeScript" />
</p>

---

## What is Relay?

Relay is a desktop application that wraps Claude's AI capabilities into a structured, visual build workflow. Instead of manually prompting an AI and copy-pasting code, Relay automates the full cycle: planning, task decomposition, code generation, and review — all in a Kanban-style interface.

## How It Works

1. **Setup** — Enter your Anthropic API key and open (or create) a project folder
2. **Describe a feature** — Write what you want built in plain English, optionally attach screenshots
3. **Review the PRD** — Claude generates a Product Requirements Document; edit and refine it
4. **Task decomposition** — The PRD is broken into a structured backlog on a Kanban board
5. **Build loop** — Start the agent and watch it build each task, streaming progress in real time
6. **Review gate** — For each completed task, review the diff — approve to commit, or reject with notes to retry
7. **Track progress** — Cost, tokens, build time, and first-pass success rate in the Summary view

## Features

- **PRD Wizard** — AI-generated product specs with streaming preview, clarification questions, image attachment support, and manual editing
- **Kanban Board** — Drag-and-drop task management across Pending, Building, and Complete columns
- **Agent Loop** — Autonomous code generation with play/pause/stop controls and three build modes:
  - **Pause for Review** — Pauses after each task for human approve/reject
  - **Auto-Pilot** — Commits each task automatically and continues
  - **Continuous** — Builds all tasks, leaves changes for batch review
- **Human Review Gate** — Syntax-highlighted diff viewer with file tree, approve/reject flow, and git integration
- **Git Integration** — Automatic branch creation, .gitignore management, commit on approve, push to remote, PR creation
- **Project Context Scanning** — Analyzes your codebase so the agent understands existing patterns
- **Multi-Feature Support** — Multiple PRDs per project with independent task backlogs
- **Build Timer** — Live elapsed timer while a task is being built
- **Metrics Dashboard** — Per-task and aggregate stats including cost tracking with per-model breakdown
- **Dark / Light Mode** — Toggle in sidebar, respects system preference
- **Keyboard Shortcuts** — `Space` to toggle the agent loop, `Esc` to close panels
- **Auto-Updates** — Built-in update checker for new releases
- **Per-Project SQLite** — All data stored locally in `.relay/relay.db` inside your project folder

## Model Options

| Model | ID | Tier | Input / Output (per 1M tokens) |
|-------|-----|------|-------------------------------|
| Haiku 4.5 | `claude-haiku-4-5-20251001` | Fast | $0.80 / $4 |
| Sonnet 4 | `claude-sonnet-4-20250514` | Balanced | $3 / $15 |
| Sonnet 4.5 | `claude-sonnet-4-5-latest` | Balanced | $3 / $15 |
| Opus 4.6 | `claude-opus-4-6` | Powerful | $15 / $75 |

Select your model in the board header. Relay supports two engine modes:
- **API Key** — Direct SDK calls via `@anthropic-ai/sdk`
- **Claude Code** — Uses the Claude CLI via `@anthropic-ai/claude-agent-sdk` (requires `claude` CLI installed)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 30 |
| Frontend | React 18, TypeScript, Tailwind CSS v4, shadcn/ui |
| State | Zustand |
| AI | Anthropic Claude (`@anthropic-ai/sdk`, `@anthropic-ai/claude-agent-sdk`) |
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

## Usage Guide

1. **Launch Relay** and enter your Anthropic API key in the setup screen
2. **Create or open a project** — point to any folder on your machine
3. **Click "New Feature"** — describe what you want built
4. **Review the PRD** — the AI generates a detailed spec; edit as needed, then approve
5. **Review tasks** — the PRD is decomposed into ordered tasks on the Kanban board
6. **Select your model** and build mode, then click **Start**
7. **Watch the agent work** — each task streams activity in the feed below the board
8. **Approve or reject** — review diffs, commit approved work, reject with notes to retry
9. **Check the Summary** tab for cost and performance metrics

## Project Structure

```
electron/
  main.ts              # Electron main process
  preload.ts           # Context bridge (relayAPI)
  agent/               # Claude agent runner, prompts, loop controller, engines
  db/                  # SQLite connection and schema
  git/                 # Git utilities (lock mutex)
  ipc/                 # IPC handlers (settings, project, prd, tasks, agent, git, review, metrics)
shared/
  types.ts             # Shared TypeScript interfaces
  pricing.ts           # Model pricing table for cost calculation
src/
  pages/               # Board, PRDWizard, Setup, Summary
  modules/             # Feature-based component modules
    board/             # KanbanBoard, KanbanColumn, TaskCard, TaskDetail
    agent/             # LoopControls, AgentActivityFeed, ActivityMessage, BuildTimer
    review/            # ReviewPanel, DiffViewer, FileChangeList, CommitDialog
    prd/               # PRDPreview, PRDEditor, FeatureInput, StepIndicator, TaskReview
    settings/          # SettingsView, ModelPicker, ApiKeyInput, ThemeToggle
    project/           # ProjectSelector, ProjectSummary, ProjectSidebar
    metrics/           # TaskMetricsTable, MetricCard
  shared/              # Reusable utilities, hooks, types, and components
  components/ui/       # shadcn/ui primitives
  store/               # Zustand store
  lib/                 # Utilities (theme, keyboard shortcuts)
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause the agent loop |
| `Esc` | Close the active panel (review or task detail) |

## License

MIT
