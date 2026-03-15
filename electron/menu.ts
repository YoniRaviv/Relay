import { app, Menu, shell, BrowserWindow, dialog, nativeImage } from 'electron';
import path from 'node:path';

function showAboutDialog(): void {
    const win = BrowserWindow.getFocusedWindow();
    const iconPath = path.join(
        app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'public'),
        'icon.png'
    );
    const icon = nativeImage.createFromPath(iconPath);

    dialog.showMessageBox({
        type: 'info',
        title: `About ${app.name}`,
        message: app.name,
        detail: [
            `Version: ${app.getVersion()}`,
            '',
            'Autonomous build loop for software development.',
            '',
            `Author: Yoni Raviv`,
            `License: GPL-3.0`,
            '',
            `Electron: ${process.versions.electron}`,
            `Node: ${process.versions.node}`,
            `Chrome: ${process.versions.chrome}`,
        ].join('\n'),
        icon,
        ...(win ? { window: win } : {}),
    });
}

export function buildAppMenu(): void {
    const isMac = process.platform === 'darwin';
    const isDev = !app.isPackaged;

    const template: Electron.MenuItemConstructorOptions[] = [
        // App menu (macOS only)
        ...(isMac ? [{
            label: app.name,
            submenu: [
                { label: `About ${app.name}`, click: showAboutDialog },
                { type: 'separator' as const },
                { role: 'services' as const },
                { type: 'separator' as const },
                { role: 'hide' as const, label: `Hide ${app.name}` },
                { role: 'hideOthers' as const },
                { role: 'unhide' as const },
                { type: 'separator' as const },
                { role: 'quit' as const, label: `Quit ${app.name}` },
            ],
        }] : []),

        // File
        {
            label: 'File',
            submenu: [
                {
                    label: 'Open Project...',
                    accelerator: 'CmdOrCtrl+O',
                    click: () => openProjectFolder(),
                },
                {
                    label: 'Switch Project',
                    accelerator: 'CmdOrCtrl+Shift+O',
                    click: () => sendToRenderer('menu:switchProject'),
                },
                { type: 'separator' },
                {
                    label: 'New Feature',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => sendToRenderer('menu:newFeature'),
                },
                { type: 'separator' },
                {
                    label: 'Settings',
                    accelerator: 'CmdOrCtrl+,',
                    click: () => sendToRenderer('menu:openSettings'),
                },
                { type: 'separator' },
                ...(isMac
                    ? [{ role: 'close' as const }]
                    : [{ role: 'quit' as const }]),
            ],
        },

        // Edit
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' },
            ],
        },

        // View
        {
            label: 'View',
            submenu: [
                {
                    label: 'Board',
                    accelerator: 'CmdOrCtrl+1',
                    click: () => sendToRenderer('menu:navigate', 'board'),
                },
                {
                    label: 'PRD',
                    accelerator: 'CmdOrCtrl+2',
                    click: () => sendToRenderer('menu:navigate', 'prd'),
                },
                {
                    label: 'Summary',
                    accelerator: 'CmdOrCtrl+3',
                    click: () => sendToRenderer('menu:navigate', 'summary'),
                },
                { type: 'separator' },
                ...(isDev ? [
                    { role: 'reload' as const },
                    { role: 'forceReload' as const },
                    { role: 'toggleDevTools' as const },
                    { type: 'separator' as const },
                ] : []),
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' },
            ],
        },

        // Build
        {
            label: 'Build',
            submenu: [
                {
                    label: 'Start / Resume Loop',
                    accelerator: 'CmdOrCtrl+R',
                    click: () => sendToRenderer('menu:loopToggle'),
                },
                {
                    label: 'Pause Loop',
                    accelerator: 'CmdOrCtrl+Shift+P',
                    click: () => sendToRenderer('menu:loopPause'),
                },
                {
                    label: 'Stop Loop',
                    accelerator: 'CmdOrCtrl+Shift+S',
                    click: () => sendToRenderer('menu:loopStop'),
                },
            ],
        },

        // Window
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                ...(isMac ? [
                    { type: 'separator' as const },
                    { role: 'front' as const },
                ] : [
                    { role: 'close' as const },
                ]),
            ],
        },

        // Help
        {
            label: 'Help',
            submenu: [
                ...(!isMac ? [
                    { label: 'About Relay', click: showAboutDialog },
                    { type: 'separator' as const },
                ] : []),
                {
                    label: 'Check for Updates...',
                    click: () => sendToRenderer('menu:checkForUpdates'),
                },
                { type: 'separator' },
                {
                    label: 'Relay on GitHub',
                    click: () => shell.openExternal('https://github.com/YoniRaviv/Relay'),
                },
            ],
        },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

async function openProjectFolder(): Promise<void> {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return;

    const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Open Project Folder',
    });

    if (result.canceled || result.filePaths.length === 0) return;
    win.webContents.send('menu:openProject', result.filePaths[0]);
}

function sendToRenderer(channel: string, ...args: unknown[]): void {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
        win.webContents.send(channel, ...args);
    }
}
