import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Repeat } from 'lucide-react'
import { useRelayStore } from '@/store/useRelayStore'
import type { ScheduledJob } from '@/shared/types/scheduler'
import { DAY_LABELS, describeRecurrence, isHourly, recurrenceOccurrences } from '../utils/recurrence'

const ROW_H = 44 // px per hour
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const DAY_MS = 86_400_000

interface Block {
    job: ScheduledJob
    ts: number
    recurring: boolean
}

/** Sunday 00:00 of the week containing `d`. */
function weekStartOf(d: Date): Date {
    const s = new Date(d)
    s.setHours(0, 0, 0, 0)
    s.setDate(s.getDate() - s.getDay())
    return s
}

function blockTint(job: ScheduledJob, recurring: boolean): string {
    if (recurring) return 'bg-sky-500/15 border-sky-500/40 text-sky-700 dark:text-sky-300'
    if (job.status === 'failed') return 'bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-300'
    if (job.status === 'done') return 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
    if (job.status === 'running') return 'bg-teal-500/20 border-teal-500/50 text-teal-700 dark:text-teal-300'
    return 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300'
}

interface WeekViewProps {
    onChanged: () => void
    onCreateAt: (ms: number) => void
}

export function WeekView({ onChanged, onCreateAt }: WeekViewProps) {
    const jobColumns = useRelayStore((s) => s.jobColumns)
    const selectJob = useRelayStore((s) => s.selectJob)
    const scrollRef = useRef<HTMLDivElement>(null)
    const [anchor, setAnchor] = useState(() => weekStartOf(new Date()))

    const weekStart = anchor
    const weekEnd = useMemo(() => new Date(weekStart.getTime() + 7 * DAY_MS), [weekStart])
    const allJobs = useMemo(() => Object.values(jobColumns).flat() as ScheduledJob[], [jobColumns])

    // Scroll to ~7am on mount so the grid doesn't open on an empty midnight.
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = 7 * ROW_H
    }, [])

    // Bucket blocks and hourly-recurring jobs per weekday column.
    const { byDay, hourlyByDay } = useMemo(() => {
        const byDay: Block[][] = Array.from({ length: 7 }, () => [])
        const hourlyByDay: ScheduledJob[][] = Array.from({ length: 7 }, () => [])
        const inWeek = (ts: number) => ts >= weekStart.getTime() && ts < weekEnd.getTime()
        const dayIndex = (ts: number) => Math.floor((ts - weekStart.getTime()) / DAY_MS)

        for (const job of allJobs) {
            if (job.scheduleCron) {
                if (isHourly(job.scheduleCron)) {
                    for (let i = 0; i < 7; i++) hourlyByDay[i].push(job)
                    continue
                }
                for (const ts of recurrenceOccurrences(job.scheduleCron, weekStart)) {
                    byDay[dayIndex(ts)].push({ job, ts, recurring: true })
                }
            } else {
                const ts = job.scheduledFor ?? job.finishedAt ?? job.startedAt
                if (ts && inWeek(ts)) byDay[dayIndex(ts)].push({ job, ts, recurring: false })
            }
        }
        return { byDay, hourlyByDay }
    }, [allJobs, weekStart, weekEnd])

    // Column-relative Y → a snapped timestamp on that day.
    const timeAt = (dayIndex: number, clientY: number, top: number): number => {
        const minutes = Math.max(0, Math.min(24 * 60 - 15, ((clientY - top) / ROW_H) * 60))
        const snapped = Math.round(minutes / 15) * 15
        const when = new Date(weekStart.getTime() + dayIndex * DAY_MS)
        when.setHours(Math.floor(snapped / 60), snapped % 60, 0, 0)
        return when.getTime()
    }

    const handleDrop = async (dayIndex: number, e: React.DragEvent) => {
        e.preventDefault()
        const jobId = e.dataTransfer.getData('text/plain')
        if (!jobId) return
        const rect = e.currentTarget.getBoundingClientRect()
        await window.relayAPI.scheduler.updateJob(jobId, { scheduledFor: timeAt(dayIndex, e.clientY, rect.top) })
        onChanged()
    }

    const handleColumnClick = (dayIndex: number, e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect()
        onCreateAt(timeAt(dayIndex, e.clientY, rect.top))
    }

    const today = new Date()
    const rangeLabel = `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(weekEnd.getTime() - DAY_MS).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`

    return (
        <div className="flex flex-1 flex-col min-h-0 rounded-lg border border-border/40 overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-[var(--color-sidebar)]">
                <button onClick={() => setAnchor(weekStartOf(new Date()))} className="text-xs font-medium px-2.5 py-1 rounded-md border border-border hover:bg-accent/50 transition-colors">
                    Today
                </button>
                <button onClick={() => setAnchor(new Date(weekStart.getTime() - 7 * DAY_MS))} className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-accent/50" title="Previous week">
                    <ChevronLeft className="h-4 w-4" />
                </button>
                <button onClick={() => setAnchor(new Date(weekStart.getTime() + 7 * DAY_MS))} className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-accent/50" title="Next week">
                    <ChevronRight className="h-4 w-4" />
                </button>
                <span className="text-sm font-medium text-foreground ml-1">{rangeLabel}</span>
                <span className="text-[11px] text-muted-foreground ml-auto">Click a slot to add · drag a job to reschedule</span>
            </div>

            {/* Day headers */}
            <div className="flex border-b border-border/40 bg-background">
                <div className="w-12 shrink-0" />
                {DAY_LABELS.map((label, i) => {
                    const date = new Date(weekStart.getTime() + i * DAY_MS)
                    const isToday = date.toDateString() === today.toDateString()
                    return (
                        <div key={i} className="flex-1 px-2 py-1.5 text-center border-l border-border/30">
                            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
                            <div className={`text-sm font-semibold ${isToday ? 'text-primary' : 'text-foreground'}`}>{date.getDate()}</div>
                            {hourlyByDay[i].length > 0 && (
                                <div className="mt-1 flex flex-wrap justify-center gap-1">
                                    {hourlyByDay[i].map((job) => (
                                        <button
                                            key={job.id}
                                            onClick={() => selectJob(job.id)}
                                            title={`${job.name} — ${describeRecurrence(job.scheduleCron)}`}
                                            className="inline-flex items-center gap-0.5 max-w-full text-[9px] font-medium px-1 py-0.5 rounded bg-sky-500/15 text-sky-600 dark:text-sky-400 truncate"
                                        >
                                            <Repeat className="h-2 w-2 shrink-0" />
                                            <span className="truncate">{job.name}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Time grid */}
            <div ref={scrollRef} className="flex-1 overflow-auto">
                <div className="flex" style={{ height: 24 * ROW_H }}>
                    {/* Hour gutter */}
                    <div className="w-12 shrink-0">
                        {HOURS.map((h) => (
                            <div key={h} className="relative border-b border-border/20" style={{ height: ROW_H }}>
                                <span className="absolute -top-1.5 right-1.5 text-[10px] text-muted-foreground">{h === 0 ? '' : `${h}:00`}</span>
                            </div>
                        ))}
                    </div>
                    {/* Day columns */}
                    {DAY_LABELS.map((_, day) => (
                        <div
                            key={day}
                            className="relative flex-1 border-l border-border/30 cursor-pointer"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => handleDrop(day, e)}
                            onClick={(e) => handleColumnClick(day, e)}
                        >
                            {HOURS.map((h) => (
                                <div key={h} className="border-b border-border/20" style={{ height: ROW_H }} />
                            ))}
                            {byDay[day].map((b, idx) => {
                                const d = new Date(b.ts)
                                const top = (d.getHours() + d.getMinutes() / 60) * ROW_H
                                return (
                                    <button
                                        key={`${b.job.id}-${idx}`}
                                        draggable={!b.recurring}
                                        onDragStart={(e) => e.dataTransfer.setData('text/plain', b.job.id)}
                                        onClick={(e) => { e.stopPropagation(); selectJob(b.job.id) }}
                                        style={{ top, minHeight: ROW_H - 4 }}
                                        className={`absolute left-0.5 right-0.5 rounded-md border px-1.5 py-1 text-left overflow-hidden transition-shadow hover:shadow-md ${blockTint(b.job, b.recurring)} ${b.recurring ? '' : 'cursor-grab active:cursor-grabbing'}`}
                                    >
                                        <div className="flex items-center gap-1 text-[10px] font-semibold leading-none">
                                            {b.recurring && <Repeat className="h-2.5 w-2.5 shrink-0" />}
                                            {d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                                        </div>
                                        <div className="text-[11px] leading-tight truncate mt-0.5">{b.job.name}</div>
                                    </button>
                                )
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
