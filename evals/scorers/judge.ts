import { runQuery } from '../runner/transport';

export const JUDGE_MODEL = 'claude-opus-4-7';

export interface JudgeRubric {
    name: string;
    question: string;
    scale: '1-5' | 'binary';
}

export interface JudgeResult {
    score: number;
    rationale: string;
}

export async function judge(opts: {
    rubric: JudgeRubric;
    output: string;
    context?: string;
}): Promise<JudgeResult> {
    const scaleInstruction = opts.rubric.scale === 'binary'
        ? 'Reply with exactly: SCORE: 0 or SCORE: 1, then RATIONALE: <one sentence>.'
        : 'Reply with exactly: SCORE: <integer 1-5>, then RATIONALE: <one sentence>.';

    const userPrompt = `${opts.context ?? ''}\n\nQUESTION: ${opts.rubric.question}\n\nOUTPUT TO EVALUATE:\n---\n${opts.output}\n---\n\n${scaleInstruction}`;

    const result = await runQuery({
        systemPrompt: 'You are a strict, fair evaluator. Reply concisely in the requested format.',
        userPrompt,
        model: JUDGE_MODEL,
    });

    const scoreMatch = result.text.match(/SCORE:\s*(\d+)/);
    const rationaleMatch = result.text.match(/RATIONALE:\s*([\s\S]+?)(?:\n\n|$)/);
    const score = scoreMatch ? Number(scoreMatch[1]) : 0;
    const rationale = rationaleMatch ? rationaleMatch[1].trim() : result.text.trim();
    return { score, rationale };
}
