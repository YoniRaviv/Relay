import { readFileSync, writeFileSync } from 'node:fs';

const rootUrl = new URL('../package.json', import.meta.url);
const launcherUrl = new URL('../launcher/package.json', import.meta.url);

const root = JSON.parse(readFileSync(rootUrl, 'utf8'));
const launcher = JSON.parse(readFileSync(launcherUrl, 'utf8'));

launcher.version = root.version;
writeFileSync(launcherUrl, JSON.stringify(launcher, null, 2) + '\n');

console.log(`Synced launcher version -> ${root.version}`);
