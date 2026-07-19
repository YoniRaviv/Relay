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

import { nextOccurrence } from './schedule';

const local = (day: number, h: number, m = 0) => new Date(2026, 6, day, h, m).getTime();

test('nextOccurrence: hourly → next top of hour', () => {
  assert.equal(nextOccurrence('hourly', local(15, 8, 30)), local(15, 9, 0));
});
test('nextOccurrence: hourly at an exact boundary is strictly after', () => {
  assert.equal(nextOccurrence('hourly', local(15, 9, 0)), local(15, 10, 0));
});
test('nextOccurrence: daily before the time fires today', () => {
  assert.equal(nextOccurrence('daily@09:00', local(15, 8, 30)), local(15, 9, 0));
});
test('nextOccurrence: daily at/after the time fires tomorrow (strictly after)', () => {
  assert.equal(nextOccurrence('daily@09:00', local(15, 9, 0)), local(16, 9, 0));
  assert.equal(nextOccurrence('daily@09:00', local(15, 14, 45)), local(16, 9, 0));
});
test('nextOccurrence: weekly later the same day fires today', () => {
  const dow = new Date(2026, 6, 15).getDay();
  assert.equal(nextOccurrence(`weekly@${dow},11:00`, local(15, 10, 0)), local(15, 11, 0));
});
test('nextOccurrence: weekly earlier the same day fires next week', () => {
  const dow = new Date(2026, 6, 15).getDay();
  assert.equal(nextOccurrence(`weekly@${dow},09:00`, local(15, 10, 0)), local(22, 9, 0));
});
test('nextOccurrence: coalescing — a 3-day-stale arm yields exactly one occurrence within 24h', () => {
  const now = local(18, 14, 0); // armed for daily@09:00 back on the 15th; app was closed
  const next = nextOccurrence('daily@09:00', now)!;
  assert.ok(next > now && next - now <= 24 * 60 * 60 * 1000);
  assert.equal(next, local(19, 9, 0));
});
test('nextOccurrence: invalid specs → null', () => {
  for (const bad of ['nope', 'daily@25:00', 'daily@09:60', 'daily@9:00', 'weekly@7,09:00', 'weekly@1', '']) {
    assert.equal(nextOccurrence(bad, local(15, 8)), null, bad);
  }
});

import { rearmPatch } from './schedule';

test('rearmPatch: recurring done job re-queues at next occurrence with a fresh session', () => {
  const now = local(15, 10, 0);
  const p = rearmPatch(job({ status: 'done', scheduleCron: 'daily@09:00', ccSessionId: 'sess-old', failureReason: 'x' }), now)!;
  assert.equal(p.status, 'queue');
  assert.equal(p.scheduledFor, local(16, 9, 0));
  assert.equal(p.ccSessionId, null);
  assert.equal(p.failureReason, null);
  assert.equal(p.startedAt, null);
  assert.equal(p.finishedAt, null);
});
test('rearmPatch: one-off job → null', () => {
  assert.equal(rearmPatch(job({ status: 'done', scheduleCron: null }), 0), null);
});
test('rearmPatch: invalid spec → null (job stays terminal, no crash loop)', () => {
  assert.equal(rearmPatch(job({ status: 'failed', scheduleCron: 'garbage' }), 0), null);
});
