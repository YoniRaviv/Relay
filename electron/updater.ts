import { app, ipcMain, BrowserWindow } from 'electron'

let autoUpdater: import('electron-updater').AppUpdater | null = null

async function getUpdater(): Promise<import('electron-updater').AppUpdater | null> {
    if (!autoUpdater) {
        try {
            const pkg = await import('electron-updater')
            autoUpdater = pkg.autoUpdater ?? null
        } catch {
            return null
        }
    }
    return autoUpdater
}

export function initAutoUpdater(): void {
    if (!app.isPackaged) {
        console.log('[Updater] Skipping auto-update in dev mode')
        return
    }

    getUpdater().then((updater) => {
        if (!updater) return
        updater.autoDownload = false
        updater.autoInstallOnAppQuit = true

        const send = (channel: string, ...args: unknown[]) => {
            const win = BrowserWindow.getAllWindows()[0]
            if (win) win.webContents.send(channel, ...args)
        }

        updater.on('checking-for-update', () => {
            send('updater:checking')
        })

        updater.on('update-available', (info) => {
            send('updater:available', { version: info.version })
        })

        updater.on('update-not-available', () => {
            send('updater:not-available')
        })

        updater.on('download-progress', (progress) => {
            send('updater:progress', { percent: progress.percent })
        })

        updater.on('update-downloaded', () => {
            send('updater:downloaded')
        })

        updater.on('error', (err) => {
            send('updater:error', { message: err.message })
        })

        // Check for updates 5 seconds after launch
        setTimeout(() => {
            updater.checkForUpdates().catch(() => {})
        }, 5000)
    })
}

export function registerUpdaterHandlers(): void {
    ipcMain.handle('updater:check', async () => {
        if (!app.isPackaged) return null
        try {
            const updater = await getUpdater()
            if (!updater) return null
            const result = await updater.checkForUpdates()
            return result?.updateInfo ? { version: result.updateInfo.version } : null
        } catch {
            return null
        }
    })

    ipcMain.handle('updater:download', async () => {
        if (!app.isPackaged) return
        const updater = await getUpdater()
        if (!updater) return
        await updater.downloadUpdate()
    })

    ipcMain.handle('updater:install', async () => {
        if (!app.isPackaged) return
        const updater = await getUpdater()
        if (!updater) return
        updater.quitAndInstall()
    })
}
