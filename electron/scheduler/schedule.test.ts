import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDue, selectToStart } from './schedule';
import type { ScheduledJob } from './types';

const job = (over: Partial<ScheduledJob>): ScheduledJob => ({
  id: over.id ?? 'j', name: 'n', instructions: '', playbookId: null, chainId: null,
  chainStep: null, prevTaskId: null, outputType: 'md', dodCondition: null, maxTurns: null,
  workingDir: null, scheduledFor: null, scheduleCron: null, status: 'queue', ccJobId: null,
  ccSessionId: null, workspacePath: null, resultType: null, resultRef: null, assumptions: [],
  totalTokens: null, costUsd: null, failureReason: null, skill: null, model: null,
  allowedTools: null, permissionMode: null,
  createdAt: over.createdAt ?? 0, updatedAt: 0, startedAt: null, finishedAt: null, ...over,
});

test('isDue: no schedule is always due', () => {
  assert.equal(isDue(job({ scheduledFor: null }), 100), true);
});
test('isDue: future schedule is not due', () => {
  assert.equal(isDue(job({ scheduledFor: 200 }), 100), false);
});
test('selectToStart: fills open slots oldest-first, respects cap', () => {
  const jobs = [job({ id: 'a', createdAt: 2 }), job({ id: 'b', createdAt: 1 }),
    { ...job({ id: 'r' }), status: 'running' as const }];
  const picked = selectToStart(jobs, 2, 100);
  assert.deepEqual(picked.map((j) => j.id), ['b']); // cap 2 - 1 running = 1 slot, oldest first
});
