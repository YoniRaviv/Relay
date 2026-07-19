import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchedulerSchema, createJob, getJob, listJobs, updateJob, deleteJob } from './db';

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
