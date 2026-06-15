#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const extract = require('extract-zip');
const { resolveTarget, assetName, assetUrl, cacheDir } = require('../lib');
const { version } = require('../package.json');

async function download(url, dest) {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) {
        throw new Error(`Download failed (${res.status} ${res.statusText})\n  ${url}`);
    }
    process.stdout.write(`Downloading Relay Studio ${version}...\n`);
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest));
}

// Returns the path to the executable/app/AppImage to launch, installing if needed.
async function ensureInstalled() {
    const t = resolveTarget(process.platform, process.arch);
    const dir = cacheDir(version);
    const marker = path.join(dir, '.installed');

    if (!fs.existsSync(marker)) {
        fs.mkdirSync(dir, { recursive: true });
        const url = assetUrl(version, t);

        if (t.ext === 'AppImage') {
            const appImage = path.join(dir, 'Relay-Studio.AppImage');
            await download(url, appImage);
            fs.chmodSync(appImage, 0o755);
        } else {
            const zip = path.join(dir, assetName(version, t));
            await download(url, zip);
            await extract(zip, { dir });
            fs.rmSync(zip, { force: true });
        }
        fs.writeFileSync(marker, new Date().toISOString());
    }
    return locateLaunchTarget(dir, t);
}

function locateLaunchTarget(dir, t) {
    if (t.os === 'mac') {
        const app = fs.readdirSync(dir).find((f) => f.endsWith('.app'));
        if (!app) throw new Error(`No .app bundle found in ${dir}`);
        return { kind: 'mac', appPath: path.join(dir, app) };
    }
    if (t.os === 'win') {
        const exe = findFile(dir, (f) => f.toLowerCase().endsWith('.exe'));
        if (!exe) throw new Error(`No .exe found in ${dir}`);
        return { kind: 'win', exePath: exe };
    }
    const appImage = path.join(dir, 'Relay-Studio.AppImage');
    if (!fs.existsSync(appImage)) throw new Error(`AppImage not found in ${dir}`);
    return { kind: 'linux', appImage };
}

// Shallow + one-level search (electron-builder win zip may nest in a subfolder).
function findFile(dir, pred) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isFile() && pred(entry.name)) return full;
        if (entry.isDirectory()) {
            const hit = fs.readdirSync(full).find(pred);
            if (hit) return path.join(full, hit);
        }
    }
    return null;
}

function launch(target) {
    let child;
    if (target.kind === 'mac') {
        child = spawn('open', ['-a', target.appPath], { detached: true, stdio: 'ignore' });
    } else if (target.kind === 'win') {
        child = spawn(target.exePath, [], { detached: true, stdio: 'ignore' });
    } else {
        child = spawn(target.appImage, [], { detached: true, stdio: 'ignore' });
    }
    child.on('error', (err) => {
        process.stderr.write(`\nFailed to launch Relay Studio: ${err.message}\n`);
        process.exitCode = 1;
    });
    child.unref();
}

(async () => {
    try {
        const target = await ensureInstalled();
        launch(target);
        process.stdout.write('Relay Studio launched.\n');
    } catch (err) {
        process.stderr.write(`\nFailed to start Relay Studio: ${err.message}\n`);
        process.exit(1);
    }
})();
