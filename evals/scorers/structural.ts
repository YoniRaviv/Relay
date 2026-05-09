import type { ScorerResult } from '../runner/types';

export type Scorer = (output: string) => ScorerResult;

export function lengthBetween(name: string, min: number, max: number): Scorer {
    return (output) => {
        const wordCount = output.trim().split(/\s+/).filter(Boolean).length;
        const passed = wordCount >= min && wordCount <= max;
        return {
            name,
            passed,
            detail: passed ? `${wordCount} words` : `${wordCount} words (expected ${min}-${max})`,
        };
    };
}

export function regexAbsent(name: string, pattern: RegExp, description: string): Scorer {
    return (output) => {
        const matches = output.match(pattern);
        const passed = !matches;
        return {
            name,
            passed,
            detail: passed ? description : `Found ${matches!.length} match(es): ${matches!.slice(0, 3).join(', ')}`,
        };
    };
}

export function regexPresent(name: string, pattern: RegExp, description: string): Scorer {
    return (output) => {
        const passed = pattern.test(output);
        return {
            name,
            passed,
            detail: passed ? description : `Pattern not found: ${pattern.source}`,
        };
    };
}
