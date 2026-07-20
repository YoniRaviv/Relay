import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runLocalJob, type SdkMessage } from './runner';
import type { MappedResult } from './dispatch';
import type { ScheduledJob } from './types';

const job: ScheduledJob = {
  id: 'j', name: 'n', instructions: 'x', playbookId: null, chainId: null,
  chainStep: null, prevTaskId: null, outputType: 'md', dodCondition: null, maxTurns: null,
  workingDir: '/tmp/wd', scheduledFor: null, scheduleCron: null, status: 'queue', ccJobId: null,
  ccSessionId: null, workspacePath: null, resultType: null, resultRef: null, assumptions: [],
  totalTokens: null, costUsd: null, failureReason: null, skill: null, model: null,
  allowedTools: null, permissionMode: null, requireApproval: false,
  createdAt: 0, updatedAt: 0, startedAt: null, finishedAt: null,
};

async function* fakeSdk(): AsyncGenerator<SdkMessage> {
  yield { type: 'system', subtype: 'init', session_id: 'sess-1' };
  yield { type: 'assistant', message: { content: [{ type: 'text', text: 'working' }], usage: { input_tokens: 3, output_tokens: 2 } } };
  yield { type: 'result', structured_output: { status: 'done', output: 'result.md', assumptions: [] }, usage: { input_tokens: 3, output_tokens: 2 } };
}

test('runLocalJob drives the sink to a done finish', async () => {
  const events: string[] = [];
  const sessions: string[] = [];
  const finishes: MappedResult[] = [];
  await runLocalJob(job, () => fakeSdk(), {
    setSession: (_id, s) => { sessions.push(s); },
    event: (_id, t, txt) => events.push(`${t}:${txt}`),
    tokens: () => {},
    finish: (_id, r) => { finishes.push(r); },
    fail: () => { throw new Error('should not fail'); },
  });
  assert.equal(sessions[0], 'sess-1');
  assert.ok(events.includes('text:working'));
  assert.equal(finishes[0]?.status, 'done');
});
