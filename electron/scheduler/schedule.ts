import type { ScheduledJob } from './types';

export function isDue(j: ScheduledJob, now: number): boolean {
  return j.scheduledFor == null || j.scheduledFor <= now;
}

export function selectToStart(jobs: ScheduledJob[], cap: number, now: number): ScheduledJob[] {
  const running = jobs.filter((j) => j.status === 'running').length;
  const slots = Math.max(0, cap - running);
  return jobs
    .filter((j) => j.status === 'queue' && isDue(j, now))
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, slots);
}
