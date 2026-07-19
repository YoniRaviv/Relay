import type { DB } from './db';
import { listPlaybooks, createPlaybook, type PlaybookInput } from './db';

/** Starter playbooks — editable/deletable; seeded once when the table is empty. */
const SEED: PlaybookInput[] = [
  {
    name: 'Researcher',
    prompt: 'Research the topic in the job instructions against high-trust sources and write a cited report.',
    skill: 'research', model: 'opus', outputType: 'md',
    dodCondition: 'the report answers the question with citations', maxTurns: 30,
  },
  {
    name: 'Daily journal',
    prompt: "Summarize today's Claude Code sessions from ~/.claude into a dated journal note.",
    model: 'sonnet', outputType: 'md',
  },
  {
    name: 'Research → summarize',
    outputType: 'md',
    steps: [
      { name: 'Research', prompt: 'Research the topic in the job instructions and write detailed notes to notes.md.', skill: null, model: null, outputType: null },
      { name: 'Summarize', prompt: 'Condense the research notes from the previous step into a one-page summary.md.', skill: null, model: null, outputType: null },
    ],
  },
];

export function seedPlaybooks(db: DB): void {
  if (listPlaybooks(db).length > 0) return;
  for (const pb of SEED) createPlaybook(db, pb);
}
