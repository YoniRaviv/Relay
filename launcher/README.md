# Relay Studio

**Website:** [relay-studio.dev](https://relay-studio.dev/) · **Source:** [github.com/YoniRaviv/Relay](https://github.com/YoniRaviv/Relay)

The official installer/launcher for **Relay Studio** — a desktop app that turns AI coding agents (Claude Code & OpenAI Codex) into a visual Kanban build loop.

Describe a feature → generate a spec or brainstorm interactively → decompose into tasks → an autonomous agent builds each one → you review via an approve/reject gate.

This npm package is a tiny launcher: on first run it downloads the Relay Studio desktop build for your platform, caches it, and opens the app. No code-signing prompts, no macOS quarantine command.

## How to use

Run it instantly with no permanent install:

```bash
npx relay-studio
```

Or install the launcher command globally:

```bash
npm install -g relay-studio
relay-studio
```

The first run downloads the matching desktop build and caches it under `~/.relay-studio/<version>/`. Subsequent runs launch instantly from the cache. To upgrade, run `npx relay-studio@latest` (or re-install globally) — the new version downloads to its own cache folder.

## Supported platforms

| Platform | Architecture | Format |
|----------|-------------|--------|
| macOS    | Apple Silicon (arm64) | `.zip` app bundle |
| Windows  | x64          | `.zip` (`.exe` inside) |
| Linux    | x64          | `.AppImage` |

> **Intel Macs:** the npm launcher is Apple Silicon only. Download the `.dmg` from the [latest release](https://github.com/YoniRaviv/Relay/releases/latest) instead.

## What you get in the app

1. **Setup** — pick your engine (Claude Code CLI, OpenAI Codex CLI, or Anthropic API key) and open a project folder
2. **Describe a feature** — plain English, attach screenshots, reference files with `@filename`
3. **Specification or Brainstorm** — generate a spec directly, or design it interactively
4. **Task decomposition** — the design is broken into structured tasks on a Kanban board
5. **Build loop** — the agent builds each task, streaming progress in real time
6. **Review gate** — review each diff, then approve to commit or reject with notes to retry
7. **Run & review** — preview your app, run an AI code review, and open a PR when done

See the full feature list and screenshots on [relay-studio.dev](https://relay-studio.dev/) and the [GitHub repo](https://github.com/YoniRaviv/Relay).

## Prefer a standalone installer?

Every platform build is also attached to the [latest GitHub release](https://github.com/YoniRaviv/Relay/releases/latest) (`.dmg`/`.zip` for macOS, `.exe`/`.zip` for Windows, `.AppImage` for Linux).

## Troubleshooting

- **Download fails / behind a proxy:** the launcher fetches builds from GitHub Releases. Ensure `https://github.com` and `https://objects.githubusercontent.com` are reachable.
- **Stale or corrupt cache:** delete `~/.relay-studio/` and run `npx relay-studio` again to re-download.
- **Node version:** requires Node.js 18 or newer.

## License

[GPL-3.0-or-later](https://github.com/YoniRaviv/Relay/blob/main/LICENSE) © Yoni Raviv
