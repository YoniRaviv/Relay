import { ipcMain } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import simpleGit from 'simple-git';
import { store } from './settings';
import { openDb } from '../db/connection';
import { withGitLock } from '../git/lock';
import { withSentry } from './withSentry';

const execFileAsync = promisify(execFile);

function getProjectPath(projectId: string): string {
  const projects = store.get('recentProjects', []) as Array<{ path: string }>;
  for (const p of projects) {
    try {
      const db = openDb(p.path);
      const row = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
      if (row) return p.path;
    } catch {
      continue;
    }
  }
  throw new Error('Project not found');
}

export interface FileChange {
  path: string;
  insertions: number;
  deletions: number;
  status: 'new' | 'modified' | 'deleted' | 'renamed';
}

export function registerGitHandlers(): void {
  // #39: Consistent .relay/ exclusion in all diff outputs
  ipcMain.handle('git:diff', async (_event, projectId: string) => {
    const projectPath = getProjectPath(projectId);
    const git = simpleGit(projectPath);
    // Get diff of all uncommitted changes (staged + unstaged), excluding .relay/
    const diff = await git.diff(['--', '.', ':!.relay/']);
    const stagedDiff = await git.diff(['--cached', '--', '.', ':!.relay/']);
    // Also include untracked files as diffs
    const status = await git.status();
    let untrackedDiff = '';
    for (const file of status.not_added.filter(f => !f.startsWith('.relay/') && !f.startsWith('.relay\\'))) {
      try {
        const content = fs.readFileSync(path.resolve(projectPath, file), 'utf-8');
        untrackedDiff += `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${content.split('\n').length} @@\n${content.split('\n').map(l => `+${l}`).join('\n')}\n`;
      } catch {
        // skip files we can't read
      }
    }
    return (stagedDiff || diff || '') + untrackedDiff;
  });

  ipcMain.handle('git:commit', withSentry('git:commit', async (_event, projectId: string, message: string) => {
    return withGitLock(async () => {
      const projectPath = getProjectPath(projectId);
      const git = simpleGit(projectPath);
      await git.add('.');
      const result = await git.commit(message);
      return { hash: result.commit, summary: result.summary };
    });
  }));

  ipcMain.handle('git:log', async (_event, projectId: string, count = 20) => {
    const projectPath = getProjectPath(projectId);
    const git = simpleGit(projectPath);
    try {
      const branchSummary = await git.branch();
      const currentBranch = branchSummary.current;
      const log = await git.log([`--max-count=${count}`, ...(currentBranch ? [currentBranch] : [])]);
      return log.all.map(entry => ({
        hash: entry.hash,
        message: entry.message,
        date: entry.date,
        author: entry.author_name,
      }));
    } catch {
      return [];
    }
  });

  ipcMain.handle('git:status', async (_event, projectId: string) => {
    const projectPath = getProjectPath(projectId);
    const git = simpleGit(projectPath);
    const status = await git.status();
    const files: FileChange[] = [
      ...status.modified.map(f => ({ path: f, insertions: 0, deletions: 0, status: 'modified' as const })),
      ...status.not_added.map(f => ({ path: f, insertions: 0, deletions: 0, status: 'new' as const })),
      ...status.created.map(f => ({ path: f, insertions: 0, deletions: 0, status: 'new' as const })),
      ...status.deleted.map(f => ({ path: f, insertions: 0, deletions: 0, status: 'deleted' as const })),
      ...status.renamed.map(f => ({ path: f.to || f.from, insertions: 0, deletions: 0, status: 'renamed' as const })),
    ];
    // Deduplicate by path
    const unique = [...new Map(files.map(f => [f.path, f])).values()];
    return { clean: status.isClean(), files: unique };
  });

  ipcMain.handle('git:branch', async (_event, projectId: string) => {
    const projectPath = getProjectPath(projectId);
    const git = simpleGit(projectPath);
    const branchSummary = await git.branch();
    return {
      current: branchSummary.current,
      branches: branchSummary.all.filter(b => !b.startsWith('remotes/')),
    };
  });

  ipcMain.handle('git:discardAll', async (_event, projectId: string) => {
    return withGitLock(async () => {
      const projectPath = getProjectPath(projectId);
      const git = simpleGit(projectPath);
      // Discard all changes: reset staged, checkout tracked, clean untracked
      await git.reset(['HEAD']);
      await git.checkout(['--', '.']);
      await git.clean('f', ['-d']);
      return { status: 'ok' };
    });
  });

  ipcMain.handle('git:checkout', async (_event, projectId: string, branch: string) => {
    const projectPath = getProjectPath(projectId);
    const git = simpleGit(projectPath);
    await git.checkout(branch);
    return { status: 'ok' };
  });

  ipcMain.handle('git:pull', async (_event, projectId: string) => {
    const projectPath = getProjectPath(projectId);
    const git = simpleGit(projectPath);
    const result = await git.pull();
    return { summary: result.summary };
  });

  ipcMain.handle('git:createBranch', async (_event, projectId: string, branchName: string, baseBranch: string) => {
    return withGitLock(async () => {
      const projectPath = getProjectPath(projectId);
      const git = simpleGit(projectPath);
      // Checkout base, pull latest, create new branch
      await git.checkout(baseBranch);
      try {
        await git.pull();
      } catch {
        // pull may fail if no remote tracking — continue anyway
      }
      await git.checkoutLocalBranch(branchName);
      return { status: 'ok', branch: branchName };
    });
  });

  ipcMain.handle('git:push', async (_event, projectId: string) => {
    return withGitLock(async () => {
      const projectPath = getProjectPath(projectId);
      const git = simpleGit(projectPath);
      const branchSummary = await git.branch();
      await git.push('origin', branchSummary.current, ['--set-upstream']);
      return { status: 'ok' };
    });
  });

  ipcMain.handle('git:stash', async (_event, projectId: string, message?: string) => {
    return withGitLock(async () => {
      const projectPath = getProjectPath(projectId);
      const git = simpleGit(projectPath);
      if (message) {
        await git.stash(['push', '-m', message]);
      } else {
        await git.stash();
      }
      return { status: 'ok' };
    });
  });

  ipcMain.handle('git:stashPop', async (_event, projectId: string, branch?: string) => {
    return withGitLock(async () => {
      const projectPath = getProjectPath(projectId);
      const git = simpleGit(projectPath);
      if (branch) {
        // Find the stash entry matching this branch
        const list = await git.stash(['list']);
        const lines = list.split('\n').filter(Boolean);
        const idx = lines.findIndex(l => l.includes(`relay:${branch}`));
        if (idx >= 0) {
          await git.stash(['pop', `stash@{${idx}}`]);
          return { status: 'ok', popped: true };
        }
        return { status: 'ok', popped: false };
      }
      await git.stash(['pop']);
      return { status: 'ok', popped: true };
    });
  });

  ipcMain.handle('git:createPr', withSentry('git:createPr', async (_event, projectId: string, title: string, body: string, baseBranch: string) => {
    const projectPath = getProjectPath(projectId);
    try {
      // Push branch to remote first
      const git = simpleGit(projectPath);
      const branchSummary = await git.branch();
      await git.push('origin', branchSummary.current, ['--set-upstream']);
    } catch (pushErr) {
      const msg = pushErr instanceof Error ? pushErr.message : String(pushErr);
      if (msg.includes('does not appear to be a git repository') || msg.includes('No configured push destination') || msg.includes("'origin' does not appear")) {
        throw new Error('No remote repository configured. Add one with: git remote add origin <url>');
      }
      // Other push errors — let PR creation attempt anyway
    }
    try {
      const { stdout } = await execFileAsync('gh', [
        'pr', 'create',
        '--title', title,
        '--body', body,
        '--base', baseBranch,
      ], { cwd: projectPath });
      const prUrl = stdout.trim();
      return { url: prUrl };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stderr = (err as { stderr?: string }).stderr ?? '';
      const detail = stderr || msg;

      if (detail.includes('no git remotes found') || detail.includes('does not appear to be a git repository')) {
        throw new Error('No remote repository configured. Add one with: git remote add origin <url>');
      }
      if (detail.includes('gh auth login') || detail.includes('not logged')) {
        throw new Error('GitHub CLI not authenticated. Run: gh auth login');
      }
      if (detail.includes('could not find')) {
        throw new Error(`Command 'gh' not found. Install it from https://cli.github.com`);
      }
      if (detail.includes('already exists')) {
        throw new Error('A pull request already exists for this branch.');
      }
      // Fallback — truncate long messages
      const short = detail.length > 200 ? detail.slice(0, 200) + '...' : detail;
      throw new Error(`PR creation failed: ${short}`);
    }
  }));

  ipcMain.handle('git:addRemote', async (_event, projectId: string, url: string) => {
    const projectPath = getProjectPath(projectId);
    const git = simpleGit(projectPath);
    await git.addRemote('origin', url);
    return { status: 'ok' };
  });

  ipcMain.handle('git:hasRemote', async (_event, projectId: string) => {
    const projectPath = getProjectPath(projectId);
    const git = simpleGit(projectPath);
    try {
      const remotes = await git.getRemotes();
      return { hasRemote: remotes.length > 0 };
    } catch {
      return { hasRemote: false };
    }
  });

  ipcMain.handle('git:getPrUrl', async (_event, projectId: string) => {
    const projectPath = getProjectPath(projectId);
    try {
      const { stdout } = await execFileAsync('gh', [
        'pr', 'view', '--json', 'url,state', '--jq', '.url + "|" + .state',
      ], { cwd: projectPath });
      const [url, state] = stdout.trim().split('|');
      return { url: url || null, state: (state || '').toLowerCase() };
    } catch {
      return { url: null, state: null };
    }
  });

  ipcMain.handle('git:checkInit', async (_event, projectId: string) => {
    const projectPath = getProjectPath(projectId);
    const gitDir = path.join(projectPath, '.git');
    return { initialized: fs.existsSync(gitDir) };
  });

  ipcMain.handle('git:init', async (_event, projectId: string) => {
    return withGitLock(async () => {
      const projectPath = getProjectPath(projectId);
      const git = simpleGit(projectPath);
      await git.init();
      ensureGitignore(projectPath);
      await git.add('.');
      await git.commit('Initial commit');
      return { status: 'ok' };
    });
  });

  ipcMain.handle('git:ensureGitignore', async (_event, projectId: string) => {
    const projectPath = getProjectPath(projectId);
    ensureGitignore(projectPath);
    return { status: 'ok' };
  });

  ipcMain.handle('git:commitFiles', async (_event, projectId: string, commitHash: string) => {
    const projectPath = getProjectPath(projectId);
    const git = simpleGit(projectPath);
    try {
      const result = await git.raw(['diff-tree', '--no-commit-id', '--name-only', '-r', commitHash]);
      return result.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  });
}

/** Common gitignore patterns by project type, keyed by signature file */
const GITIGNORE_RULES: Record<string, { label: string; patterns: string[] }> = {
  'package.json': {
    label: 'Node / JS',
    patterns: [
      'node_modules/',
      'dist/',
      'build/',
      '.next/',
      '.nuxt/',
      '.output/',
      '.cache/',
      '.turbo/',
      'coverage/',
      '.env',
      '.env.local',
      '.env*.local',
      '*.tsbuildinfo',
      'npm-debug.log*',
      'yarn-debug.log*',
      'yarn-error.log*',
      '.pnpm-debug.log*',
    ],
  },
  'Cargo.toml': {
    label: 'Rust',
    patterns: ['target/', '*.pdb'],
  },
  'go.mod': {
    label: 'Go',
    patterns: ['bin/', 'vendor/'],
  },
  'requirements.txt': {
    label: 'Python',
    patterns: [
      '__pycache__/',
      '*.py[cod]',
      '*$py.class',
      '.venv/',
      'venv/',
      'env/',
      '.env',
      'dist/',
      'build/',
      '*.egg-info/',
      '.eggs/',
    ],
  },
  'pyproject.toml': {
    label: 'Python',
    patterns: [
      '__pycache__/',
      '*.py[cod]',
      '*$py.class',
      '.venv/',
      'venv/',
      'env/',
      '.env',
      'dist/',
      'build/',
      '*.egg-info/',
      '.eggs/',
    ],
  },
  'Gemfile': {
    label: 'Ruby',
    patterns: ['vendor/bundle/', '.bundle/', 'log/', 'tmp/'],
  },
  'pom.xml': {
    label: 'Java / Maven',
    patterns: ['target/', '*.class', '*.jar', '*.war'],
  },
  'build.gradle': {
    label: 'Java / Gradle',
    patterns: ['build/', '.gradle/', '*.class', '*.jar', '*.war'],
  },
  'pubspec.yaml': {
    label: 'Dart / Flutter',
    patterns: ['.dart_tool/', 'build/', '.flutter-plugins', '.flutter-plugins-dependencies'],
  },
  'Package.swift': {
    label: 'Swift',
    patterns: ['.build/', 'DerivedData/', '*.xcuserstate'],
  },
  'composer.json': {
    label: 'PHP',
    patterns: ['vendor/', '.env'],
  },
};

/** Universal patterns that should always be ignored */
const UNIVERSAL_PATTERNS = [
  '.relay/',
  '.DS_Store',
  'Thumbs.db',
  '*.log',
  '*.swp',
  '*.swo',
  '.idea/',
  '.vscode/',
  '*.sublime-workspace',
];

function ensureGitignore(projectPath: string): void {
  const gitignorePath = path.join(projectPath, '.gitignore');
  try {
    const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';
    const lines = new Set(existing.split('\n').map(l => l.trim()));

    // Collect patterns to add
    const toAdd: string[] = [];

    // Always add universal patterns
    for (const pattern of UNIVERSAL_PATTERNS) {
      if (!lines.has(pattern)) toAdd.push(pattern);
    }

    // Detect project type and add ecosystem-specific patterns
    for (const [signatureFile, { patterns }] of Object.entries(GITIGNORE_RULES)) {
      if (fs.existsSync(path.join(projectPath, signatureFile))) {
        for (const pattern of patterns) {
          if (!lines.has(pattern)) toAdd.push(pattern);
        }
      }
    }

    if (toAdd.length > 0) {
      // Deduplicate additions
      const unique = [...new Set(toAdd)];
      const base = existing.endsWith('\n') || existing === '' ? existing : existing + '\n';
      fs.writeFileSync(gitignorePath, base + unique.join('\n') + '\n', 'utf-8');
    }
  } catch {
    // Best effort — don't block on gitignore issues
  }
}
