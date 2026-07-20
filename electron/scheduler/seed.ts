import type { DB } from './db';
import { listPlaybooks, createPlaybook, getMeta, setMeta, type PlaybookInput } from './db';

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

const SEEDED_KEY = 'playbooks_seeded';

export function seedPlaybooks(db: DB): void {
  if (getMeta(db, SEEDED_KEY) != null) return;
  if (listPlaybooks(db).length === 0) {
    for (const pb of SEED) createPlaybook(db, pb);
  }
  // Mark seeded whether or not we just seeded — legacy DBs that already have playbooks
  // (or had the starters deleted before this marker existed) must not reseed either.
  setMeta(db, SEEDED_KEY, '1');
}
