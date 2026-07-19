import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchedulerSchema, createJob, getJob, listJobs, updateJob, deleteJob, createRun, finishRun, createPlaybook, usageSummary } from './db';
import { rearmPatch } from './schedule';

function freshDb() {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initSchedulerSchema(db);
    return db;
}

test('createJob defaults to backlog and round-trips', () => {
    const db = freshDb();
    const job = createJob(db, { name: 'Nightly summary', instructions: 'summarize', workingDir: '/tmp/x' });
    assert.equal(job.status, 'backlog');
    assert.equal(job.outputType, 'md');
    assert.equal(getJob(db, job.id)!.name, 'Nightly summary');
    assert.equal(listJobs(db).length, 1);
});

test('updateJob patches status and clears fields', () => {
    const db = freshDb();
    const job = createJob(db, { name: 'x' });
    const upd = updateJob(db, job.id, { status: 'queue', scheduledFor: 123 });
    assert.equal(upd.status, 'queue');
    assert.equal(upd.scheduledFor, 123);
});

test('deleteJob removes the job and cascades events/runs', () => {
    const db = freshDb();
    const job = createJob(db, { name: 'x' });
    assert.equal(deleteJob(db, job.id), true);
    assert.equal(getJob(db, job.id), undefined);
});

test('recurring job re-arm round-trips through the DB', () => {
  const db = freshDb();
  const job = createJob(db, { name: 'nightly', instructions: 'x', scheduleCron: 'daily@09:00', scheduledFor: 1000 });
  // Simulate the run lifecycle: queue → running → done, then apply the re-arm patch.
  updateJob(db, job.id, { status: 'running', ccSessionId: 'sess-1', startedAt: 2000 });
  updateJob(db, job.id, { status: 'done', finishedAt: 3000, resultRef: 'result.md' });
  const now = new Date(2026, 6, 15, 10, 0).getTime();
  const patch = rearmPatch(getJob(db, job.id)!, now);
  assert.ok(patch, 'recurring done job must produce a re-arm patch');
  const rearmed = updateJob(db, job.id, patch!);
  assert.equal(rearmed.status, 'queue');
  assert.equal(rearmed.scheduledFor, new Date(2026, 6, 16, 9, 0).getTime());
  assert.equal(rearmed.ccSessionId, null);
  assert.equal(rearmed.startedAt, null);
  assert.equal(rearmed.finishedAt, null);
  assert.equal(rearmed.resultRef, 'result.md'); // last result kept
  assert.equal(rearmed.scheduleCron, 'daily@09:00'); // recurrence survives
});

test('requireApproval round-trips and defaults to false', () => {
  const db = freshDb();
  const off = createJob(db, { name: 'plain' });
  assert.equal(off.requireApproval, false);
  const on = createJob(db, { name: 'gated', requireApproval: true });
  assert.equal(getJob(db, on.id)!.requireApproval, true);
});

test('usageSummary aggregates runs per job, per playbook, and per day', () => {
  const db = freshDb();
  const pb = createPlaybook(db, { name: 'Researcher' });
  const a = createJob(db, { name: 'a', playbookId: pb.id });
  const b = createJob(db, { name: 'b' });
  const r1 = createRun(db, a.id);
  finishRun(db, r1.id, { status: 'done', totalTokens: 100, costUsd: 0.5 });
  const r2 = createRun(db, a.id);
  finishRun(db, r2.id, { status: 'failed', totalTokens: 50, costUsd: 0.25 });
  const r3 = createRun(db, b.id);
  finishRun(db, r3.id, { status: 'done', totalTokens: 10, costUsd: 0.1 });

  const u = usageSummary(db);
  assert.equal(u.jobs.length, 2);
  assert.equal(u.jobs[0].jobId, a.id); // ordered by cost desc
  assert.equal(u.jobs[0].runs, 2);
  assert.equal(u.jobs[0].tokens, 150);
  assert.ok(Math.abs(u.jobs[0].costUsd - 0.75) < 1e-9);
  assert.deepEqual(u.playbooks.map((p) => [p.playbookId, p.runs]), [[pb.id, 2]]);
  assert.equal(u.daily.length, 1); // all runs today
  assert.equal(u.daily[0].runs, 3);
});
