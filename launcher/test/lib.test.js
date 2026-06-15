const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveTarget, assetName, assetUrl, cacheDir } = require('../lib');

test('resolveTarget maps macOS arm64', () => {
    assert.deepEqual(resolveTarget('darwin', 'arm64'), { os: 'mac', arch: 'arm64', ext: 'zip' });
});

test('resolveTarget rejects Intel Macs with a guidance message', () => {
    assert.throws(() => resolveTarget('darwin', 'x64'), /Intel Macs are not supported/);
});

test('resolveTarget maps Windows x64', () => {
    assert.deepEqual(resolveTarget('win32', 'x64'), { os: 'win', arch: 'x64', ext: 'zip' });
});

test('resolveTarget maps Linux x64', () => {
    assert.deepEqual(resolveTarget('linux', 'x64'), { os: 'linux', arch: 'x64', ext: 'AppImage' });
});

test('resolveTarget throws on unsupported platform', () => {
    assert.throws(() => resolveTarget('aix', 'x64'), /Unsupported platform/);
});

test('assetUrl builds the GitHub release download URL', () => {
    const t = { os: 'mac', arch: 'arm64', ext: 'zip' };
    assert.equal(
        assetUrl('0.9.7-alpha', t),
        'https://github.com/YoniRaviv/Relay/releases/download/0.9.7-alpha/Relay-Studio-mac-arm64-0.9.7-alpha.zip'
    );
});

test('assetName formats the filename correctly', () => {
    assert.equal(
        assetName('1.2.3', { os: 'mac', arch: 'arm64', ext: 'zip' }),
        'Relay-Studio-mac-arm64-1.2.3.zip'
    );
});

test('resolveTarget throws on Linux non-x64 arch', () => {
    assert.throws(() => resolveTarget('linux', 'arm64'), /Unsupported platform/);
});

test('cacheDir is version-scoped under the home dir', () => {
    const dir = cacheDir('0.9.7-alpha');
    assert.ok(dir.endsWith(require('path').join('.relay-studio', '0.9.7-alpha')));
});
