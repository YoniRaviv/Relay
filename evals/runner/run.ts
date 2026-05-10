import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeReport } from './report';
import type { SuiteReport } from './types';
import { runPrdSuite } from './prdSuite';
import { runDecomposeSuite } from './decomposeSuite';
import { DEFAULT_MODEL } from '../../shared/pricing';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const RESULTS_DIR = path.join(ROOT, 'evals', 'results');

type SuiteName = 'prd' | 'decompose' | 'all';

interface CliArgs {
    suite: SuiteName;
    model: string;
    noJudge: boolean;
}

function parseArgs(argv: string[]): CliArgs {
    const args: CliArgs = { suite: 'all', model: DEFAULT_MODEL, noJudge: false };
    for (const arg of argv.slice(2)) {
        if (arg === '--no-judge') { args.noJudge = true; continue; }
        const [k, v] = arg.split('=');
        if (k === '--suite') {
            if (v !== 'prd' && v !== 'decompose' && v !== 'all') {
                throw new Error(`Unknown suite: ${v}. Expected: prd | decompose | all`);
            }
            args.suite = v;
        } else if (k === '--model') {
            if (!v) throw new Error('--model requires a value');
            args.model = v;
        }
    }
    return args;
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv);
    const reports: SuiteReport[] = [];
    if (args.suite === 'prd' || args.suite === 'all') reports.push(await runPrdSuite(args.model, args.noJudge));
    if (args.suite === 'decompose' || args.suite === 'all') reports.push(await runDecomposeSuite(args.model, args.noJudge));
    for (const report of reports) {
        const { mdPath } = writeReport(report, RESULTS_DIR);
        console.log(`[runner] ${report.suite}: ${report.summary.passed}/${report.summary.total} passed → ${path.relative(ROOT, mdPath)}`);
    }
}

main().catch(err => { console.error(err); process.exit(1); });
