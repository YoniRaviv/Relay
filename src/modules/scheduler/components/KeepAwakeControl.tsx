import { useCallback, useEffect, useRef, useState } from 'react'
import { Coffee, ChevronDown } from 'lucide-react'
import { useClickOutside } from '@/shared/hooks/useClickOutside'
import { useRelayStore } from '@/store/useRelayStore'

const PRESETS: Array<{ label: string; seconds: number }> = [
    { label: '30m', seconds: 30 * 60 },
    { label: '1h', seconds: 60 * 60 },
    { label: '2h', seconds: 2 * 60 * 60 },
    { label: '4h', seconds: 4 * 60 * 60 },
]

function formatCountdown(ms: number): string {
    const totalSec = Math.max(0, Math.floor(ms / 1000))
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
}

export function KeepAwakeControl() {
    const awakeUntil = useRelayStore((s) => s.awakeUntil)
    const setAwakeUntil = useRelayStore((s) => s.setAwakeUntil)
    const [open, setOpen] = useState(false)
    const [untilTime, setUntilTime] = useState('')
    const [now, setNow] = useState(() => Date.now())
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        window.relayAPI.scheduler.caffeinate.state().then((s) => setAwakeUntil(s.awakeUntil))
    }, [setAwakeUntil])

    useEffect(() => {
        if (!awakeUntil) return
        const interval = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(interval)
    }, [awakeUntil])

    useClickOutside(ref, useCallback(() => setOpen(false), []), open)

    const isAwake = !!awakeUntil && awakeUntil > now

    const handleStart = async (seconds: number) => {
        const { awakeUntil: newUntil } = await window.relayAPI.scheduler.caffeinate.start(seconds)
        setAwakeUntil(newUntil)
        setOpen(false)
    }

    const handleStartUntil = async () => {
        if (!untilTime) return
        const [h, m] = untilTime.split(':').map(Number)
        const target = new Date()
        target.setHours(h, m, 0, 0)
        if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1)
        await handleStart(Math.round((target.getTime() - Date.now()) / 1000))
    }

    const handleStop = async () => {
        await window.relayAPI.scheduler.caffeinate.stop()
        setAwakeUntil(null)
    }

    if (isAwake) {
        return (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                <Coffee className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    Awake {formatCountdown(awakeUntil! - now)}
                </span>
                <button onClick={handleStop} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Stop
                </button>
            </div>
        )
    }

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/60 border border-border hover:bg-accent/50 transition-colors"
            >
                <Coffee className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">Keep Awake</span>
                <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute top-full right-0 mt-1 w-64 rounded-lg bg-card border border-border shadow-xl z-50 p-3 space-y-3">
                    <div className="grid grid-cols-4 gap-1.5">
                        {PRESETS.map((p) => (
                            <button
                                key={p.label}
                                onClick={() => handleStart(p.seconds)}
                                className="px-2 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-accent/50 transition-colors"
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="time"
                            value={untilTime}
                            onChange={(e) => setUntilTime(e.target.value)}
                            className="flex-1 px-2 py-1.5 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        <button
                            onClick={handleStartUntil}
                            disabled={!untilTime}
                            className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                        >
                            Until
                        </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                        Keeps the Mac awake while the lid is open; closing the lid still sleeps it.
                    </p>
                </div>
            )}
        </div>
    )
}
