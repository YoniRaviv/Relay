import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { CalendarClock, X } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'

interface DateTimePickerProps {
    value: number | null
    onChange: (ms: number | null) => void
    placeholder?: string
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5)
const PANEL_H = 380

export function DateTimePicker({ value, onChange, placeholder = 'Run now' }: DateTimePickerProps) {
    const [open, setOpen] = useState(false)
    const [pos, setPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 })
    const triggerRef = useRef<HTMLDivElement>(null)
    const panelRef = useRef<HTMLDivElement>(null)

    const selected = value ? new Date(value) : undefined
    const now = new Date()
    const [hour, setHour] = useState(selected ? selected.getHours() : now.getHours())
    const [minute, setMinute] = useState(selected ? Math.round(selected.getMinutes() / 5) * 5 % 60 : 0)

    // Anchor the floating panel to the trigger via fixed positioning — it lives in a portal
    // so the modal's overflow-y-auto can't clip it or force scrolling.
    useLayoutEffect(() => {
        if (!open || !triggerRef.current) return
        const rect = triggerRef.current.getBoundingClientRect()
        const below = rect.bottom + 6
        const flipUp = rect.bottom + PANEL_H > window.innerHeight && rect.top > PANEL_H
        setPos({
            top: flipUp ? rect.top - PANEL_H - 6 : below,
            left: rect.left,
            width: rect.width,
        })
    }, [open])

    // Close on outside click (trigger + portaled panel both count as "inside").
    useLayoutEffect(() => {
        if (!open) return
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node
            if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
    }, [open])

    const commit = (day: Date | undefined, h: number, m: number) => {
        if (!day) return
        const d = new Date(day)
        d.setHours(h, m, 0, 0)
        onChange(d.getTime())
    }

    return (
        <div className="relative" ref={triggerRef}>
            <div className="flex items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => setOpen((o) => !o)}
                    className="flex flex-1 items-center gap-2 px-3 py-2 text-sm rounded-md border border-border bg-background hover:bg-accent/50 transition-colors"
                >
                    <CalendarClock className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className={selected ? '' : 'text-muted-foreground'}>
                        {selected ? format(selected, 'EEE, MMM d yyyy · h:mm a') : placeholder}
                    </span>
                </button>
                {selected && (
                    <button
                        type="button"
                        onClick={() => onChange(null)}
                        title="Clear (run now)"
                        className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent/50 transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            {open && createPortal(
                <div
                    ref={panelRef}
                    style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: Math.max(pos.width, 288) }}
                    className="z-[60] rounded-lg border border-border bg-popover text-popover-foreground p-3 shadow-2xl ring-1 ring-black/10"
                >
                    <Calendar
                        mode="single"
                        selected={selected}
                        defaultMonth={selected}
                        onSelect={(day) => commit(day, hour, minute)}
                    />
                    <div className="mt-2 flex items-center gap-2 border-t border-border pt-3">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Time</span>
                        <div className="flex items-center gap-1">
                            <select
                                value={hour}
                                onChange={(e) => { const h = Number(e.target.value); setHour(h); commit(selected, h, minute) }}
                                className="px-2 py-1 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                                {HOURS.map((h) => (
                                    <option key={h} value={h}>{String(h).padStart(2, '0')}</option>
                                ))}
                            </select>
                            <span className="text-muted-foreground">:</span>
                            <select
                                value={minute}
                                onChange={(e) => { const m = Number(e.target.value); setMinute(m); commit(selected, hour, m) }}
                                className="px-2 py-1 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                                {MINUTES.map((m) => (
                                    <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </div>
    )
}
