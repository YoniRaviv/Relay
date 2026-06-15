'use strict';
const os = require('os');
const path = require('path');

const REPO = 'YoniRaviv/Relay';

function resolveTarget(platform, arch) {
    if (platform === 'darwin') {
        if (arch !== 'arm64') {
            throw new Error(
                `Intel Macs are not supported via npm. Download the .dmg from https://github.com/${REPO}/releases/latest`
            );
        }
        return { os: 'mac', arch: 'arm64', ext: 'zip' };
    }
    if (platform === 'win32') {
        return { os: 'win', arch: 'x64', ext: 'zip' };
    }
    if (platform === 'linux') {
        if (arch !== 'x64') {
            throw new Error(`Unsupported platform: ${platform} (${arch})`);
        }
        return { os: 'linux', arch: 'x64', ext: 'AppImage' };
    }
    throw new Error(`Unsupported platform: ${platform} (${arch})`);
}

function assetName(version, t) {
    return `Relay-Studio-${t.os}-${t.arch}-${version}.${t.ext}`;
}

function assetUrl(version, t) {
    return `https://github.com/${REPO}/releases/download/${version}/${assetName(version, t)}`;
}

function cacheDir(version) {
    return path.join(os.homedir(), '.relay-studio', version);
}

module.exports = { resolveTarget, assetName, assetUrl, cacheDir, REPO };
