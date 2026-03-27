import simpleGit from 'simple-git';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../db/connection';
import { getProjectPath } from '../db/projectLookup';
import type { Task } from '../../shared/types';

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

    const IGNORE_PREFIXES = ['node_modules/', '.relay/', 'dist/', 'build/', '.next/', '.nuxt/', 'target/', '__pycache__/', '.venv/', 'venv/', 'vendor/', 'coverage/'];

    // Fetch all commit file lists in parallel for faster context building
    const showResults = await Promise.all(
        completedTasks
            .filter(t => t.commit_hash)
            .map(t => git.show([(t.commit_hash as string), '--name-only', '--format=']).catch(() => ''))
    );
    for (const show of showResults) {
        for (const line of show.trim().split('\n')) {
            const file = line.trim();
            if (!file) continue;
            if (IGNORE_PREFIXES.some(p => file.startsWith(p))) continue;
            modifiedFiles.add(file);
            if (modifiedFiles.size >= 100) break;
        }
        if (modifiedFiles.size >= 100) break;
    }

    if (modifiedFiles.size > 0) {
        sections.push(
            `## Files Modified by Previous Tasks\nThese files were already changed in this feature. If your task touches them, they contain recent work.\n` +
            [...modifiedFiles].map(f => `- \`${f}\``).join('\n')
        );
    }

    // ── 3. Pre-load key source files the current task likely needs ──
    const MAX_PRELOAD_BYTES = 100_000; // 100KB total budget for pre-loaded files
    const MAX_FILE_BYTES = 30_000;     // 30KB per file max
    const filesToPreload = resolveRelevantFiles(currentTask, modifiedFiles, projectPath);
    const preloaded: string[] = [];
    let preloadedBytes = 0;

    for (const filePath of filesToPreload) {
        if (preloadedBytes >= MAX_PRELOAD_BYTES) break;
        const absPath = path.resolve(projectPath, filePath);
        try {
            if (!fs.existsSync(absPath)) continue;
            const stat = fs.statSync(absPath);
            if (stat.size > MAX_FILE_BYTES) continue;
            const content = fs.readFileSync(absPath, 'utf-8');
            preloaded.push(`### ${filePath}\n\`\`\`\n${content}\n\`\`\``);
            preloadedBytes += content.length;
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
