import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQueryOptions, mapResult, RESULT_SCHEMA } from './dispatch';
import type { ScheduledJob } from './types';

const base: ScheduledJob = {
  id: 'j', name: 'n', instructions: 'do it', playbookId: null, chainId: null,
  chainStep: null, prevTaskId: null, outputType: 'md', dodCondition: null, maxTurns: null,
  workingDir: '/tmp/wd', scheduledFor: null, scheduleCron: null, status: 'queue', ccJobId: null,
  ccSessionId: null, workspacePath: null, resultType: null, resultRef: null, assumptions: [],
  totalTokens: null, costUsd: null, failureReason: null, skill: null, model: null,
  allowedTools: null, permissionMode: null,
  createdAt: 0, updatedAt: 0, startedAt: null, finishedAt: null,
};

test('buildQueryOptions sets settingSources and json_schema output', () => {
  const o = buildQueryOptions(base);
  assert.deepEqual(o.settingSources, ['user', 'project']);
  assert.equal(o.outputFormat.type, 'json_schema');
  assert.equal(o.outputFormat.schema, RESULT_SCHEMA);
  assert.equal(o.cwd, '/tmp/wd');
});

test('mapResult maps a done envelope', () => {
  const r = mapResult({
    structured_output: { status: 'done', output: 'result.md', assumptions: [] },
    usage: { input_tokens: 10, output_tokens: 5 },
  });
  assert.equal(r.status, 'done');
  assert.equal(r.tokens, 15);
});
