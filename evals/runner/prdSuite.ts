import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runQuery } from './transport';
import { judge } from '../scorers/judge';
import { lengthBetween, regexAbsent } from '../scorers/structural';
import { buildPrdPrompt, PRD_PROMPT_VERSION } from '../../electron/agent/prompts';
import type { EvalRun, ScorerResult, SuiteReport } from './types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DATASET_PATH = path.join(ROOT, 'evals', 'datasets', 'prd.jsonl');

const PATH_PATTERN = /\.(tsx?|jsx|py|rs|go|rb|java)\b|\bsrc\/|\belectron\/|\bshared\//;

interface PrdCase {
    id: string;
    bucket: string;
    description: string;
    projectContext: string | null;
    includeTests: boolean;
}

function loadDataset(): PrdCase[] {
    const lines = fs.readFileSync(DATASET_PATH, 'utf-8').split('\n').filter(Boolean);
    return lines.map(l => JSON.parse(l) as PrdCase);
}

function checkSections(prd: string, includeTests: boolean): ScorerResult {
    const expected = includeTests
        ? ['# PRD:', '## 1. Problem Statement', '## 2. Solution', '## 3. User Stories', '## 4. Implementation Decisions', '## 5. Testing Decisions', '## 6. Out of Scope', '## 7. Further Notes']
        : ['# PRD:', '## 1. Problem Statement', '## 2. Solution', '## 3. User Stories', '## 4. Implementation Decisions', '## 5. Out of Scope', '## 6. Further Notes'];

    const missing: string[] = [];
    let lastIdx = -1;
    let outOfOrder = false;
    for (const heading of expected) {
        const idx = prd.indexOf(heading);
        if (idx === -1) {
            missing.push(heading);
        } else if (idx < lastIdx) {
            outOfOrder = true;
        } else {
            lastIdx = idx;
        }
    }
    const passed = missing.length === 0 && !outOfOrder;
    const parts: string[] = [];
    if (missing.length) parts.push(`Missing: ${missing.join(', ')}`);
    if (outOfOrder) parts.push('Sections out of order');
    const detail = passed ? 'All required sections present in order' : parts.join('. ');
    return { name: 'sections-present-in-order', passed, detail };
}

function checkUserStoryFormat(prd: string): ScorerResult {
    const start = prd.indexOf('## 3. User Stories');
    const after = start === -1 ? -1 : prd.indexOf('## 4. Implementation', start);
    if (start === -1 || after === -1) {
        return { name: 'user-story-format', passed: false, detail: 'Could not locate §3 block' };
    }
    const block = prd.slice(start, after);
    const stories = block.match(/US-\d{3}\b/g) ?? [];
    const wellFormed = block.match(/As an? .+?, I want .+?, so that .+?[.\n]/gi) ?? [];
    const passed = stories.length >= 3 && wellFormed.length >= Math.max(1, stories.length - 1);
    return {
        name: 'user-story-format',
        passed,
        detail: `${stories.length} story IDs, ${wellFormed.length} matching "As a X, I want Y, so that Z"`,
    };
}

function checkTestingSection(prd: string, includeTests: boolean): ScorerResult {
    const present = /^## \d\. Testing Decisions/m.test(prd);
    const passed = present === includeTests;
    return {
        name: 'testing-section-conditional',
        passed,
        detail: passed
            ? `Testing section ${includeTests ? 'present' : 'absent'} (correct for includeTests=${includeTests})`
            : `Testing section ${present ? 'present but should be absent' : 'absent but should be present'}`,
    };
}

const pathValidator = regexAbsent('no-file-paths', PATH_PATTERN, 'No file paths or extensions detected');
const lengthValidator = lengthBetween('length-1500-6000-words', 1500, 6000);

async function judgeAll(description: string, prd: string): Promise<ScorerResult[]> {
    const context = `Original feature request:\n${description}`;
    const rubrics = [
        { name: 'judge-coverage', question: 'Does this PRD address every aspect of the requested feature without leaving major gaps?' },
        { name: 'judge-specificity', question: 'Are the user stories and implementation decisions specific and actionable, not vague or hand-wavy?' },
        { name: 'judge-scope-discipline', question: 'Does the Out of Scope section actually prune scope (naming concrete adjacent items deferred), rather than restating the feature?' },
    ] as const;

    const results: ScorerResult[] = [];
    for (const r of rubrics) {
        const { score, rationale } = await judge({
            rubric: { name: r.name, question: r.question, scale: '1-5' },
            output: prd,
            context,
        });
        results.push({ name: r.name, passed: score >= 3, score, detail: rationale });
    }
    return results;
}

export async function runPrdSuite(model: string, noJudge: boolean = false): Promise<SuiteReport> {
    const cases = loadDataset();
    const runs: EvalRun[] = [];
    let totalScore = 0;
    let scoredCount = 0;

    for (const c of cases) {
        const t0 = Date.now();
        const userPrompt = buildPrdPrompt(c.description, undefined, c.projectContext ?? undefined, false, c.includeTests);
        const systemPrompt = 'You are a senior product manager. When signing or attributing the document, use the author name "Relay Studio Agent".';

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
            scorers.push(checkSections(output, c.includeTests));
            scorers.push(checkUserStoryFormat(output));
            scorers.push(checkTestingSection(output, c.includeTests));
            scorers.push(pathValidator(output));
            scorers.push(lengthValidator(output));
            if (!noJudge) {
                const judgeResults = await judgeAll(c.description, output);
                scorers.push(...judgeResults);
                for (const j of judgeResults) {
                    if (j.score !== undefined) { totalScore += j.score; scoredCount++; }
                }
            }
        }

        runs.push({ caseId: c.id, output, usage, scorers, durationMs: Date.now() - t0 });
        const pct = scorers.filter(s => s.passed).length;
        console.log(`[runner:prd] ${c.id} done — ${pct}/${scorers.length} scorers passed (${Date.now() - t0}ms)`);
        if (runError) console.error(`  error: ${runError}`);
    }

    const passed = runs.filter(r => r.scorers.every(s => s.passed)).length;
    return {
        suite: 'prd',
        promptVersion: PRD_PROMPT_VERSION,
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
