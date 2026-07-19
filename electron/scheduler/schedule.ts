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

const DAILY_RE = /^daily@(\d{2}):(\d{2})$/;
const WEEKLY_RE = /^weekly@([0-6]),(\d{2}):(\d{2})$/;

/**
 * Next fire time strictly after `after`, in local wall-clock time, or null for an
 * invalid spec. Specs: 'hourly' | 'daily@HH:MM' | 'weekly@D,HH:MM' (D = Date.getDay()).
 * Date#setDate/#setHours preserve wall-clock components across DST transitions, which is
 * the behavior users expect from "daily at 09:00".
 */
export function nextOccurrence(spec: string, after: number): number | null {
  if (spec === 'hourly') {
    const d = new Date(after);
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d.getTime();
  }
  const daily = DAILY_RE.exec(spec);
  if (daily) {
    const h = Number(daily[1]), m = Number(daily[2]);
    if (h > 23 || m > 59) return null;
    const d = new Date(after);
    d.setHours(h, m, 0, 0);
    if (d.getTime() <= after) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  const weekly = WEEKLY_RE.exec(spec);
  if (weekly) {
    const dow = Number(weekly[1]), h = Number(weekly[2]), m = Number(weekly[3]);
    if (h > 23 || m > 59) return null;
    const d = new Date(after);
    d.setHours(h, m, 0, 0);
    d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7));
    if (d.getTime() <= after) d.setDate(d.getDate() + 7);
    return d.getTime();
  }
  return null;
}

/**
 * Patch that re-arms a terminal recurring job: back to queue at the next occurrence.
 * ccSessionId MUST clear — the next occurrence is a fresh session, and a stale id would
 * make reconcileOrphan resume the previous (finished) run after a restart. resultRef is
 * kept so the last result stays visible until the next run replaces it.
 */
export function rearmPatch(j: ScheduledJob, now: number): Partial<ScheduledJob> | null {
  if (!j.scheduleCron) return null;
  const next = nextOccurrence(j.scheduleCron, now);
  if (next == null) return null;
  return {
    status: 'queue', scheduledFor: next,
    ccSessionId: null, failureReason: null, startedAt: null, finishedAt: null,
  };
}
