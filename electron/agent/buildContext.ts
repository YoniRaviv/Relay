import simpleGit from 'simple-git';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../db/connection';
import { store } from '../ipc/settings';
import type { Task } from '../../shared/types';

function getProjectPath(projectId: string): string {
    const projects = store.get('recentProjects', []) as Array<{ path: string }>;
    for (const p of projects) {
        try {
            const db = openDb(p.path);
            const row = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
            if (row) return p.path;
        } catch { continue; }
    }
    throw new Error('Project not found');
}

/**
 * Build cumulative context for the next task in the loop.
 * This gives the agent a head start so it doesn't waste time exploring.
 *
 * Includes:
 * - Completed task summaries (what was already built)
 * - Files modified by previous tasks (so the agent knows where to look)
 * - Key source file contents pre-loaded (so the agent can skip reading them)
 * - Upcoming task list (so the agent avoids doing work meant for later tasks)
 */
export async function buildCumulativeContext(
    projectId: string,
    prdId: string | undefined,
    currentTask: Task,
): Promise<string> {
    const sections: string[] = [];
    const projectPath = getProjectPath(projectId);
    const db = openDb(projectPath);

    // ── 1. Completed tasks summary ──
    const completedTasks = (prdId
        ? db.prepare(
            `SELECT story_id, title, description, commit_hash FROM tasks
             WHERE project_id = ? AND prd_id = ? AND status IN ('done', 'review')
             ORDER BY "order" ASC`
        ).all(projectId, prdId)
        : db.prepare(
            `SELECT story_id, title, description, commit_hash FROM tasks
             WHERE project_id = ? AND status IN ('done', 'review')
             ORDER BY "order" ASC`
        ).all(projectId)
    ) as Array<Record<string, unknown>>;

    if (completedTasks.length > 0) {
        const taskLines = completedTasks.map(t => {
            const hash = t.commit_hash ? ` (${(t.commit_hash as string).slice(0, 7)})` : '';
            return `- **${t.story_id}**: ${t.title}${hash}`;
        }).join('\n');
        sections.push(`## Completed Tasks\nThese tasks are already done. Do not redo their work.\n${taskLines}`);
    }

    // ── 2. Files modified by previous tasks ──
    const modifiedFiles = new Set<string>();
    const git = simpleGit(projectPath);

    for (const t of completedTasks) {
        if (!t.commit_hash) continue;
        try {
            const show = await git.show([
                (t.commit_hash as string), '--name-only', '--format='
            ]);
            for (const line of show.trim().split('\n')) {
                const file = line.trim();
                if (file && !file.startsWith('.relay/')) {
                    modifiedFiles.add(file);
                }
            }
        } catch {
            // commit may not exist (reverted, etc.)
        }
    }

    if (modifiedFiles.size > 0) {
        sections.push(
            `## Files Modified by Previous Tasks\nThese files were already changed in this feature. If your task touches them, they contain recent work.\n` +
            [...modifiedFiles].map(f => `- \`${f}\``).join('\n')
        );
    }

    // ── 3. Pre-load key source files the current task likely needs ──
    const filesToPreload = resolveRelevantFiles(currentTask, modifiedFiles, projectPath);
    const preloaded: string[] = [];

    for (const filePath of filesToPreload) {
        const absPath = path.resolve(projectPath, filePath);
        try {
            if (!fs.existsSync(absPath)) continue;
            const stat = fs.statSync(absPath);
            // Skip files larger than 30KB (too big for context)
            if (stat.size > 30_000) continue;
            const content = fs.readFileSync(absPath, 'utf-8');
            preloaded.push(`### ${filePath}\n\`\`\`\n${content}\n\`\`\``);
        } catch {
            // skip unreadable files
        }
    }

    if (preloaded.length > 0) {
        sections.push(
            `## Pre-loaded Files\nThese files are relevant to your task. Use them directly — do NOT re-read them with tools unless you need a fresh copy.\n\n` +
            preloaded.join('\n\n')
        );
    }

    // ── 4. Remaining tasks (so agent avoids scope creep) ──
    const remainingTasks = (prdId
        ? db.prepare(
            `SELECT story_id, title FROM tasks
             WHERE project_id = ? AND prd_id = ? AND status = 'pending' AND id != ?
             ORDER BY "order" ASC`
        ).all(projectId, prdId, currentTask.id)
        : db.prepare(
            `SELECT story_id, title FROM tasks
             WHERE project_id = ? AND status = 'pending' AND id != ?
             ORDER BY "order" ASC`
        ).all(projectId, currentTask.id)
    ) as Array<Record<string, unknown>>;

    if (remainingTasks.length > 0) {
        const upcoming = remainingTasks.slice(0, 5).map(t =>
            `- ${t.story_id}: ${t.title}`
        ).join('\n');
        sections.push(
            `## Upcoming Tasks (DO NOT implement these)\nThese tasks will be handled separately. Stay focused on your current task only.\n${upcoming}`
        );
    }

    return sections.join('\n\n');
}

/**
 * Resolve which files are most relevant to the current task.
 * Uses file paths mentioned in the task description/AC, plus files from previous tasks.
 */
function resolveRelevantFiles(
    task: Task,
    previouslyModified: Set<string>,
    projectPath: string,
): string[] {
    const files = new Set<string>();

    // Extract file paths from task description and acceptance criteria
    const text = `${task.description}\n${task.acceptanceCriteria}`;
    const filePatterns = [
        // Match paths like src/components/Foo.tsx, lib/utils.ts, etc.
        /(?:^|\s|`)((?:src|lib|app|pages|components|modules|shared|electron|public|styles|hooks|utils|services|api)\/[\w./-]+\.\w+)/g,
        // Match quoted file paths
        /"([^"]+\.\w{1,5})"/g,
        /`([^`]+\.\w{1,5})`/g,
    ];

    for (const pattern of filePatterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const filePath = match[1];
            if (filePath && !filePath.startsWith('.relay/')) {
                files.add(filePath);
            }
        }
    }

    // Include files modified by previous tasks that overlap with mentioned directories
    const mentionedDirs = new Set<string>();
    for (const f of files) {
        const dir = path.dirname(f);
        if (dir !== '.') mentionedDirs.add(dir);
    }

    for (const prevFile of previouslyModified) {
        const dir = path.dirname(prevFile);
        if (mentionedDirs.has(dir)) {
            files.add(prevFile);
        }
    }

    // Cap at 8 files to avoid bloating the context
    const result = [...files].slice(0, 8);

    // Verify files exist
    return result.filter(f => {
        try {
            return fs.existsSync(path.resolve(projectPath, f));
        } catch {
            return false;
        }
    });
}
