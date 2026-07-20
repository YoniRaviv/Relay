import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

export interface SchedulerSkill {
  /** The identifier injected into the prompt: `research` or `code-review:code-review`. */
  name: string;
  description: string;
  /** optgroup label — "Personal" or the plugin name. */
  group: string;
}

/** Minimal frontmatter reader — pulls `name`/`description`, handling folded (`>-`) blocks. */
function parseFrontmatter(md: string): { name?: string; description?: string } {
  if (!md.startsWith('---')) return {};
  const end = md.indexOf('\n---', 3);
  if (end === -1) return {};
  const lines = md.slice(3, end).split('\n');
  const out: { name?: string; description?: string } = {};
  for (let i = 0; i < lines.length; i++) {
    const m = /^(name|description):\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const key = m[1] as 'name' | 'description';
    let val = m[2].trim();
    if (['>', '>-', '|', '|-'].includes(val)) {
      const parts: string[] = [];
      for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j]); j++) parts.push(lines[j].trim());
      val = parts.join(' ');
    } else {
      val = val.replace(/^["']|["']$/g, '');
    }
    out[key] = val;
  }
  return out;
}

function descOf(dir: string): string {
  try {
    const md = join(dir, 'SKILL.md');
    return existsSync(md) ? (parseFrontmatter(readFileSync(md, 'utf8')).description ?? '') : '';
  } catch {
    return '';
  }
}

/** Every immediate subdir that contains a SKILL.md. */
function skillDirs(root: string): string[] {
  if (!existsSync(root)) return [];
  try {
    return readdirSync(root, { withFileTypes: true })
      // isDirectory() is false for symlinked skill dirs (e.g. ~/.claude/skills/foo -> ../../.agents/...),
      // so accept symlinks too; existsSync follows the link to confirm it's a real skill.
      .filter((e) => (e.isDirectory() || e.isSymbolicLink()) && existsSync(join(root, e.name, 'SKILL.md')))
      .map((e) => join(root, e.name));
  } catch {
    return [];
  }
}

/** Personal skills in ~/.claude/skills + plugin skills (namespaced plugin:skill). */
export function listAvailableSkills(): SchedulerSkill[] {
  const home = homedir();
  const skills: SchedulerSkill[] = [];

  for (const dir of skillDirs(join(home, '.claude', 'skills'))) {
    skills.push({ name: basename(dir), description: descOf(dir), group: 'Personal' });
  }

  // Plugins: resolve each installed plugin's install path, scan its skills/ and .claude/skills/.
  try {
    const manifestPath = join(home, '.claude', 'plugins', 'installed_plugins.json');
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        plugins?: Record<string, { installPath?: string }[]>;
      };
      for (const [key, entries] of Object.entries(manifest.plugins ?? {})) {
        const pluginName = key.split('@')[0];
        for (const entry of entries) {
          if (!entry.installPath) continue;
          const roots = [join(entry.installPath, 'skills'), join(entry.installPath, '.claude', 'skills')];
          for (const root of roots) {
            for (const dir of skillDirs(root)) {
              skills.push({ name: `${pluginName}:${basename(dir)}`, description: descOf(dir), group: pluginName });
            }
          }
        }
      }
    }
  } catch {
    // Malformed manifest — personal skills still return.
  }

  // Dedupe by injected name; personal wins over a same-named plugin entry.
  const seen = new Set<string>();
  return skills.filter((s) => (seen.has(s.name) ? false : (seen.add(s.name), true)));
}
