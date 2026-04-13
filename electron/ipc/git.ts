import { ipcMain, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import simpleGit from 'simple-git';
import { getProjectPath } from '../db/projectLookup';
import { withGitLock } from '../git/lock';
import { withSentry } from './withSentry';

export interface FileChange {
  path: string;
  insertions: number;
  deletions: number;
  status: 'new' | 'modified' | 'deleted' | 'renamed';
}

/** Convert a git remote URL (SSH or HTTPS) to a web base URL like https://github.com/owner/repo */
async function getRemoteWebUrl(git: ReturnType<typeof simpleGit>): Promise<string | null> {
  try {
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin');
    const raw = origin?.refs?.push || origin?.refs?.fetch;
    if (!raw) return null;

    // SSH: git@github.com:owner/repo.git → https://github.com/owner/repo
    const sshMatch = raw.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
    if (sshMatch) return `https://${sshMatch[1]}/${sshMatch[2]}`;

    // HTTPS: https://github.com/owner/repo.git → https://github.com/owner/repo
    // Also handles https://user:token@github.com/... by stripping credentials
    const httpsMatch = raw.match(/^https?:\/\/(?:[^@]+@)?(.+?)(?:\.git)?$/);
    if (httpsMatch) return `https://${httpsMatch[1]}`;

    return null;
  } catch {
    return null;
  }
}

/** Build a "new PR" URL for GitHub, GitLab, or Bitbucket */
function buildPrCreationUrl(remoteWebUrl: string, base: string, head: string, title: string, body: string): string {
  const params = new URLSearchParams();

  if (remoteWebUrl.includes('github.com')) {
    params.set('expand', '1');
    params.set('title', title);
    params.set('body', body);
    return `${remoteWebUrl}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}?${params}`;
  }

  if (remoteWebUrl.includes('gitlab')) {
    params.set('merge_request[source_branch]', head);
    params.set('merge_request[target_branch]', base);
    params.set('merge_request[title]', title);
    params.set('merge_request[description]', body);
    return `${remoteWebUrl}/-/merge_requests/new?${params}`;
  }

  if (remoteWebUrl.includes('bitbucket')) {
    return `${remoteWebUrl}/pull-requests/new?source=${encodeURIComponent(head)}&dest=${encodeURIComponent(base)}&title=${encodeURIComponent(title)}`;
  }

  // Fallback: GitHub-style
  params.set('expand', '1');
  params.set('title', title);
  params.set('body', body);
  return `${remoteWebUrl}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}?${params}`;
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
    const MAX_UNTRACKED_FILES = 50;
    const MAX_FILE_SIZE = 100 * 1024; // 100KB
    const untrackedFiles = status.not_added.filter(f => !f.startsWith('.relay/') && !f.startsWith('.relay\\'));
    let fileCount = 0;
    for (const file of untrackedFiles) {
      if (fileCount >= MAX_UNTRACKED_FILES) {
        untrackedDiff += `\n# ... ${untrackedFiles.length - fileCount} more untracked files not shown\n`;
        break;
      }
      try {
        const absPath = path.resolve(projectPath, file);
        const stat = fs.statSync(absPath);
        if (stat.size > MAX_FILE_SIZE) {
          untrackedDiff += `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1 @@\n+(file too large to preview — ${Math.round(stat.size / 1024)}KB)\n`;
          fileCount++;
          continue;
        }
        // Skip binary files (check for null bytes in first 8KB)
        const fd = fs.openSync(absPath, 'r');
        const probe = Buffer.alloc(Math.min(8192, stat.size));
        fs.readSync(fd, probe, 0, probe.length, 0);
        fs.closeSync(fd);
        if (probe.includes(0)) {
          untrackedDiff += `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1 @@\n+(binary file)\n`;
          fileCount++;
          continue;
        }
        const content = fs.readFileSync(absPath, 'utf-8');
        untrackedDiff += `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${content.split('\n').length} @@\n${content.split('\n').map(l => `+${l}`).join('\n')}\n`;
        fileCount++;
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
      const branchSummary = await git.branch();
      const currentBranch = branchSummary.current;

      let didStash = false;
      if (currentBranch !== baseBranch) {
        // Need to switch — check for uncommitted changes and stash if needed
        const status = await git.status();
        if (!status.isClean()) {
          await git.stash(['push', '-m', `relay:auto-stash-before-branch-${branchName}`]);
          didStash = true;
        }
        try {
          await git.checkout(baseBranch);
        } catch (err) {
          // Restore stash before propagating the error
          if (didStash) {
            try { await git.stash(['pop']); } catch { /* best effort */ }
          }
          throw err;
        }
      }

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
    const git = simpleGit(projectPath);

    const branchSummary = await git.branch();
    const currentBranch = branchSummary.current;

    // Build the PR creation URL from the remote
    const remoteUrl = await getRemoteWebUrl(git);
    if (!remoteUrl) {
      throw new Error('Could not determine remote repository URL.');
    }

    // Try pushing branch to remote
    let pushFailed = false;
    try {
      await git.push('origin', currentBranch, ['--set-upstream']);
    } catch (pushErr) {
      const msg = pushErr instanceof Error ? pushErr.message : String(pushErr);
      if (msg.includes('does not appear to be a git repository') || msg.includes('No configured push destination') || msg.includes("'origin' does not appear")) {
        throw new Error('No remote repository configured. Add one with: git remote add origin <url>');
      }
      // Auth/permission errors — don't block, let user push manually
      pushFailed = true;
    }

    const prUrl = buildPrCreationUrl(remoteUrl, baseBranch, currentBranch, title, body);
    shell.openExternal(prUrl);
    return { url: prUrl, pushFailed };
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

  ipcMain.handle('git:getPrUrl', async (_event, _projectId: string) => {
    // Without gh CLI, we can't query PR status from the API.
    // Return null — the UI handles this gracefully.
    return { url: null, state: null };
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
    const modified = ensureGitignore(projectPath);
    // Auto-commit .gitignore if it was modified to avoid false "uncommitted changes" dialogs
    if (modified) {
      try {
        const git = simpleGit(projectPath);
        await git.add('.gitignore');
        await git.commit('chore: update .gitignore [relay]');
      } catch {
        // Non-critical — if commit fails (e.g., no git init yet), the user will see the diff
      }
    }
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

/** Returns true if .gitignore was modified */
function ensureGitignore(projectPath: string): boolean {
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
      return true;
    }
    return false;
  } catch {
    // Best effort — don't block on gitignore issues
    return false;
  }
}
