import { execFile } from 'node:child_process';

/** Fire-and-forget macOS notification; silent no-op elsewhere or on failure. */
export function notify(title: string, message: string): void {
  if (process.platform !== 'darwin') return;
  const esc = (s: string) => s.slice(0, 200).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ');
  execFile('osascript', ['-e', `display notification "${esc(message)}" with title "${esc(title)}"`], () => {});
}
