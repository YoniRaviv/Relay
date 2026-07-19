import { useEffect, useRef, useState } from 'react'
import { useIpcListener } from '@/shared/hooks/useIpcListener'
import type { JobEvent } from '@/shared/types/scheduler'

interface JobActivityFeedProps {
    jobId: string
}

interface LiveActivity {
    jobId: string
    type: string
    text: string
    ts: number
}

export function JobActivityFeed({ jobId }: JobActivityFeedProps) {
    const [persisted, setPersisted] = useState<JobEvent[]>([])
    const [live, setLive] = useState<LiveActivity[]>([])
    const bottomRef = useRef<HTMLDivElement>(null)

    // Load events recorded before this panel was open; live events after that arrive via push.
    useEffect(() => {
        let cancelled = false
        setPersisted([])
        setLive([])
        window.relayAPI.scheduler.getEvents(jobId, 0).then((fetched) => {
            if (!cancelled) setPersisted(fetched as JobEvent[])
        })
        return () => { cancelled = true }
    }, [jobId])

    useIpcListener('scheduler:activity', (data: unknown) => {
        const activity = data as LiveActivity
        if (activity.jobId !== jobId) return
        setLive((prev) => [...prev, activity])
    }, [jobId])

    const entries = [
        ...persisted.map((e) => ({ key: `p-${e.id}`, ts: e.ts, text: e.text })),
        ...live.map((e, i) => ({ key: `l-${i}-${e.ts}`, ts: e.ts, text: e.text })),
    ]

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [entries.length])

    if (entries.length === 0) {
        return <p className="text-[13px] text-muted-foreground italic">No activity yet.</p>
    }

    return (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {entries.map((e) => (
                <div key={e.key} className="flex items-start gap-2 text-[12px]">
                    <span className="text-muted-foreground shrink-0 font-mono">
                        {new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-foreground/90 break-words">{e.text}</span>
                </div>
            ))}
            <div ref={bottomRef} />
        </div>
    )
}
