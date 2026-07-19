// Renderer-side parse/format for the schedule_cron spec ('hourly' | 'daily@HH:MM' |
// 'weekly@D,HH:MM', D = Date.getDay()). Occurrence math lives in the main process
// (electron/scheduler/schedule.ts) — the renderer only builds and labels specs.

export type RecurrenceKind = 'hourly' | 'daily' | 'weekly'

export interface Recurrence {
    kind: RecurrenceKind
    dow: number
    time: string
}

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function parseRecurrence(cron: string | null): Recurrence | null {
    if (!cron) return null
    if (cron === 'hourly') return { kind: 'hourly', dow: 1, time: '09:00' }
    const daily = /^daily@(\d{2}:\d{2})$/.exec(cron)
    if (daily) return { kind: 'daily', dow: 1, time: daily[1] }
    const weekly = /^weekly@([0-6]),(\d{2}:\d{2})$/.exec(cron)
    if (weekly) return { kind: 'weekly', dow: Number(weekly[1]), time: weekly[2] }
    return null
}

export function buildRecurrence(kind: RecurrenceKind, dow: number, time: string): string {
    if (kind === 'hourly') return 'hourly'
    if (kind === 'daily') return `daily@${time}`
    return `weekly@${dow},${time}`
}

/** Short human label for badges/detail: 'hourly' · 'daily 09:00' · 'Mon 09:00'. */
export function describeRecurrence(cron: string | null): string | null {
    const r = parseRecurrence(cron)
    if (!r) return null
    if (r.kind === 'hourly') return 'hourly'
    if (r.kind === 'daily') return `daily ${r.time}`
    return `${DAY_LABELS[r.dow]} ${r.time}`
}
