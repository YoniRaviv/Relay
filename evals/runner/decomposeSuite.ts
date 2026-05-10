import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runQuery } from './transport';
import { judge } from '../scorers/judge';
import { buildDecomposePrompt, DECOMPOSE_PROMPT_VERSION } from '../../electron/agent/prompts';
import type { EvalRun, ScorerResult, SuiteReport } from './types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DATASET_PATH = path.join(ROOT, 'evals', 'datasets', 'decompose.jsonl');

const VAGUE_PATTERN = /\b(works correctly|as expected|properly|appropriately|good performance|sufficient|reasonable)\b/i;

interface DecomposeCase {
    id: string;
    prdMarkdown: string;
    expectedStoryIds: string[];
    includeTests: boolean;
}

interface DecomposedTask {
    storyId: string;
    title: string;
    description: string;
    acceptanceCriteria: string;
    priority: string;
    userStoriesCovered: string[];
}

function loadDataset(): DecomposeCase[] {
    if (!fs.existsSync(DATASET_PATH)) return [];
    const lines = fs.readFileSync(DATASET_PATH, 'utf-8').split('\n').filter(Boolean);
    return lines.map(l => JSON.parse(l) as DecomposeCase);
}

type ParseResult = { ok: true; tasks: DecomposedTask[] } | { ok: false; error: string };

function tryParseTasks(output: string): ParseResult {
    const stripped = output.replace(/```json\s*|\s*```/g, '').trim();
    const start = stripped.indexOf('[');
    const end = stripped.lastIndexOf(']');
    if (start === -1 || end === -1) return { ok: false, error: 'No JSON array found in output' };
    try {
        const parsed = JSON.parse(stripped.slice(start, end + 1));
        if (!Array.isArray(parsed)) return { ok: false, error: 'Parsed value is not an array' };
        return { ok: true, tasks: parsed as DecomposedTask[] };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

function checkTaskCount(tasks: DecomposedTask[]): ScorerResult {
    const passed = tasks.length >= 4 && tasks.length <= 12;
    return { name: 'task-count-4-12', passed, detail: `${tasks.length} tasks (expected 4-12)` };
}

function checkStoriesCoveredPopulated(tasks: DecomposedTask[]): ScorerResult {
    const empty = tasks.filter(t => !t.userStoriesCovered || t.userStoriesCovered.length === 0);
    return {
        name: 'every-task-has-stories',
        passed: empty.length === 0,
        detail: empty.length === 0
            ? 'All tasks reference user stories'
            : `${empty.length} task(s) missing userStoriesCovered`,
    };
}

function checkEveryStoryCovered(tasks: DecomposedTask[], expected: string[]): ScorerResult {
    const covered = new Set<string>();
    for (const t of tasks) for (const id of (t.userStoriesCovered ?? [])) covered.add(id);
    const missing = expected.filter(id => !covered.has(id));
    return {
        name: 'every-story-covered',
        passed: missing.length === 0,
        detail: missing.length === 0
            ? `All ${expected.length} expected stories covered`
            : `Missing: ${missing.join(', ')}`,
    };
}

function checkAcceptanceCriteriaSpecific(tasks: DecomposedTask[]): ScorerResult {
    const offenders: string[] = [];
    for (const t of tasks) {
        if (!t.acceptanceCriteria || t.acceptanceCriteria.length < 30) {
            offenders.push(`${t.title} (too short)`);
        } else if (VAGUE_PATTERN.test(t.acceptanceCriteria)) {
            offenders.push(`${t.title} (vague language)`);
        }
    }
    return {
        name: 'acceptance-criteria-specific',
        passed: offenders.length === 0,
        detail: offenders.length === 0
            ? 'No vague language or stub criteria'
            : `${offenders.length}/${tasks.length} flagged: ${offenders.slice(0, 3).join('; ')}`,
    };
}

async function judgeVertical(task: DecomposedTask, prdMarkdown: string): Promise<{ score: number; rationale: string }> {
    const context = `PRD context (truncated):\n${prdMarkdown.slice(0, 4000)}\n\n--- TASK BEING EVALUATED ---\nTitle: ${task.title}\nDescription: ${task.description}\nAcceptance Criteria:\n${task.acceptanceCriteria}`;

    return judge({
        rubric: {
            name: 'vertical-slicing',
            question: 'Is this task a vertical/tracer-bullet slice (one demoable end-to-end behavior, cutting through data + server + UI as needed)? Or is it a horizontal/layer-scoped chunk (data-only, API-only, UI-only, "scaffold types", "set up X")? Reply 1 if vertical, 0 if horizontal.',
            scale: 'binary',
        },
        output: 'See task above',
        context,
    });
}

export async function runDecomposeSuite(model: string, noJudge: boolean = false): Promise<SuiteReport> {
    const cases = loadDataset();
    const runs: EvalRun[] = [];
    let totalScore = 0;
    let scoredCount = 0;

    if (cases.length === 0) {
        console.log('[runner:decompose] No dataset entries yet — populate evals/datasets/decompose.jsonl from C2 outputs to enable this suite.');
    }

    for (const c of cases) {
        const t0 = Date.now();
        const userPrompt = buildDecomposePrompt(c.prdMarkdown, undefined, c.includeTests);
        const systemPrompt = 'You are a senior software architect. Return only valid JSON.';

        let output = '';
        let usage = { input_tokens: 0, output_tokens: 0 };
        let runError: string | undefined;
        try {
            const r = await runQuery({ systemPrompt, userPrompt, model });
            output = r.text;
            usage = r.usage;
        } catch (err) {
            runError = err instanceof Error ? err.message : String(err);
        }

        const scorers: ScorerResult[] = [];
        if (runError) {
            scorers.push({ name: 'query-completed', passed: false, detail: runError });
        } else {
            const parsed = tryParseTasks(output);
            scorers.push({
                name: 'valid-json',
                passed: parsed.ok,
                detail: parsed.ok ? `${parsed.tasks.length} tasks parsed` : parsed.error,
            });

            if (parsed.ok) {
                scorers.push(checkTaskCount(parsed.tasks));
                scorers.push(checkStoriesCoveredPopulated(parsed.tasks));
                scorers.push(checkEveryStoryCovered(parsed.tasks, c.expectedStoryIds));
                scorers.push(checkAcceptanceCriteriaSpecific(parsed.tasks));

                if (!noJudge) {
                    let verticalCount = 0;
                    for (const task of parsed.tasks) {
                        const { score } = await judgeVertical(task, c.prdMarkdown);
                        if (score === 1) verticalCount++;
                        totalScore += score;
                        scoredCount++;
                    }
                    const verticalPct = parsed.tasks.length > 0 ? verticalCount / parsed.tasks.length : 0;
                    scorers.push({
                        name: 'vertical-slicing-classifier',
                        passed: verticalPct >= 0.8,
                        score: Math.round(verticalPct * 100) / 100,
                        detail: `${verticalCount}/${parsed.tasks.length} classified vertical (${(verticalPct * 100).toFixed(0)}%, threshold 80%)`,
                    });
                }
            }
        }

        runs.push({ caseId: c.id, output, usage, scorers, durationMs: Date.now() - t0 });
        const pass = scorers.filter(s => s.passed).length;
        console.log(`[runner:decompose] ${c.id} done — ${pass}/${scorers.length} scorers passed (${Date.now() - t0}ms)`);
    }

    const passed = runs.filter(r => r.scorers.every(s => s.passed)).length;
    return {
        suite: 'decompose',
        promptVersion: DECOMPOSE_PROMPT_VERSION,
        model,
        timestamp: new Date().toISOString(),
        runs,
        summary: {
            total: runs.length,
            passed,
            failed: runs.length - passed,
            avgScore: scoredCount > 0 ? totalScore / scoredCount : undefined,
        },
    };
}
