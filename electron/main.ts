import './sentry'
import { app, BrowserWindow, dialog, nativeImage } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { registerAllHandlers } from './ipc/register'
import { closeAllDbs } from './db/connection'
import { stopProject } from './runner/projectRunner'
import { buildAppMenu } from './menu'
import { initAutoUpdater, registerUpdaterHandlers } from './updater'
import { getLoopState } from './agent/loopController'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

// Global error handlers — surface crashes instead of failing silently
process.on('uncaughtException', (error) => {
  // Suppress EPIPE errors — these occur when writing to a closed pipe (e.g. during agent pause/stop)
  if (error.message?.includes('EPIPE') || (error as NodeJS.ErrnoException).code === 'EPIPE') {
    console.warn('[Relay] Suppressed EPIPE error:', error.message)
    return
  }
  console.error('[Relay] Uncaught exception:', error)
  dialog.showErrorBox('Unexpected Error', `${error.message}\n\n${error.stack ?? ''}`)
})

process.on('unhandledRejection', (reason) => {
  console.error('[Relay] Unhandled rejection:', reason)
})

app.setName('Relay')

if (process.platform === 'darwin' && app.dock) {
  // Use nativeImage.createFromPath with the .icns for proper macOS dock icon sizing
  const icnsPath = path.join(process.env.VITE_PUBLIC!, 'icon.icns')
  const pngPath = path.join(process.env.VITE_PUBLIC!, 'icon.png')
  const iconPath = fs.existsSync(icnsPath) ? icnsPath : pngPath
  app.dock.setIcon(nativeImage.createFromPath(iconPath))
}

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Relay',
    icon: path.join(process.env.VITE_PUBLIC!, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // Set Content-Security-Policy to prevent XSS (relaxed in dev for Vite HMR)
  if (!VITE_DEV_SERVER_URL) {
    win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'",
          ],
        },
      })
    })
  }

  // Warn before closing if the build loop is still running
  win.on('close', (e) => {
    const state = getLoopState()
    if (state === 'running' || state === 'paused') {
      const choice = dialog.showMessageBoxSync(win!, {
        type: 'warning',
        buttons: ['Cancel', 'Close'],
        defaultId: 0,
        cancelId: 0,
        title: 'Build Loop Running',
        message: 'The build loop is still running. In-progress work may be lost.',
        detail: 'Are you sure you want to close Relay?',
      })
      if (choice === 0) {
        e.preventDefault()
      }
    }
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

}

registerAllHandlers()
registerUpdaterHandlers()

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('before-quit', () => {
  stopProject()
  closeAllDbs()
})

app.whenReady().then(() => {
  buildAppMenu()
  createWindow()
  initAutoUpdater()
})
