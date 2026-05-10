import fs from 'node:fs';
import path from 'node:path';
import type { SuiteReport } from './types';

export function writeReport(report: SuiteReport, outDir: string): { jsonPath: string; mdPath: string } {
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = report.timestamp.replace(/[:.]/g, '-');
    const base = `${report.suite}-${stamp}`;
    const jsonPath = path.join(outDir, `${base}.json`);
    const mdPath = path.join(outDir, `${base}.md`);

    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    const lines: string[] = [];
    lines.push(`# Eval Report: ${report.suite}`);
    lines.push('');
    lines.push(`- **Prompt version:** ${report.promptVersion}`);
    lines.push(`- **Model:** ${report.model}`);
    lines.push(`- **Timestamp:** ${report.timestamp}`);
    lines.push(`- **Total:** ${report.summary.total}, **Passed:** ${report.summary.passed}, **Failed:** ${report.summary.failed}`);
    if (report.summary.avgScore !== undefined) {
        lines.push(`- **Average judge score:** ${report.summary.avgScore.toFixed(2)}`);
    }
    lines.push('');
    for (const run of report.runs) {
        const allPass = run.scorers.every(s => s.passed);
        lines.push(`## ${run.caseId} ${allPass ? 'PASS' : 'FAIL'}`);
        for (const s of run.scorers) {
            const mark = s.passed ? 'PASS' : 'FAIL';
            const score = s.score !== undefined ? ` (score: ${s.score})` : '';
            lines.push(`- [${mark}] **${s.name}**${score}${s.detail ? ` — ${s.detail}` : ''}`);
        }
        lines.push('');
    }
    fs.writeFileSync(mdPath, lines.join('\n'));
    return { jsonPath, mdPath };
}
