# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Relay is a desktop app that turns Claude Code into a visual Kanban build loop. Built with Electron + Vite + React + TypeScript.

## Commands

- `npm run dev` — Start Vite dev server with Electron (HMR enabled)
- `npm run build` — TypeScript check + Vite build + electron-builder package
- `npm run lint` — ESLint with zero warnings allowed
- `npm run preview` — Preview the Vite production build

## Architecture

**Electron main process** (`electron/main.ts`): Creates the BrowserWindow, handles app lifecycle (macOS dock behavior, quit-on-close). In dev, loads from Vite dev server URL; in production, loads from `dist/index.html`.

**Preload script** (`electron/preload.ts`): Exposes `ipcRenderer` (on/off/send/invoke) to the renderer via `contextBridge`. Access in renderer code as `window.ipcRenderer`.

**Renderer / React app** (`src/`): Standard React 18 app mounted at `#root`. Entry point is `src/main.tsx` → `src/App.tsx`.

**Build outputs**:
- `dist/` — Vite-built renderer assets
- `dist-electron/` — Compiled Electron main + preload (`main.js`, `preload.mjs`)
- `release/` — Packaged app artifacts (configured in `electron-builder.json5`)

## Key Config Files

- `vite.config.ts` — Uses `vite-plugin-electron/simple` to build both main and preload entries alongside the renderer
- `electron-builder.json5` — Packaging config (mac: dmg, win: nsis, linux: AppImage)
- `tsconfig.json` — Strict mode, ES2020 target, includes both `src/` and `electron/`

## IPC Pattern

The preload script wraps `ipcRenderer` methods. To add new IPC channels:
1. Register handler in `electron/main.ts` with `ipcMain.handle()` or `ipcMain.on()`
2. Call from renderer via `window.ipcRenderer.invoke(channel)` or `window.ipcRenderer.send(channel)`
3. Types for `window.ipcRenderer` are declared in `electron/electron-env.d.ts`
