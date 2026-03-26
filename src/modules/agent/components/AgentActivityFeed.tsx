import { useEffect, useMemo, useRef } from 'react'
import { ActionBlock } from './ActionBlock'
import { TextBlock } from './TextBlock'
import { LiveSummaryBar } from './LiveSummaryBar'
import { groupActions } from '../utils/parseActivity'
import { isActionGroup } from '@/shared/types/activity'
import { useRelayStore } from '@/store/useRelayStore'

export function AgentActivityFeed() {
    const activityFeed = useRelayStore((s) => s.activityFeed)
    const bottomRef = useRef<HTMLDivElement>(null)

    // Incremental grouping: only reprocess when new items are appended.
    // Falls back to full reprocess when the feed is cleared/reset (length shrinks).
    const cacheRef = useRef<{ length: number; result: ReturnType<typeof groupActions> }>({ length: 0, result: [] })
    const grouped = useMemo(() => {
        if (activityFeed.length < cacheRef.current.length) {
            // Feed was cleared — full reprocess
            cacheRef.current = { length: activityFeed.length, result: groupActions(activityFeed) }
        } else if (activityFeed.length > cacheRef.current.length) {
            // New items appended — full reprocess (groupActions pairs tool_use with tool_result
            // across items, so incremental append isn't safe without duplicating pairing state).
            // The key optimisation is avoiding reprocess when the reference changes but length doesn't.
            cacheRef.current = { length: activityFeed.length, result: groupActions(activityFeed) }
        }
        // Same length = same result (feed is append-only within a session)
        return cacheRef.current.result
    }, [activityFeed])

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [activityFeed.length])

    if (activityFeed.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground italic">
                No activity yet. Start the loop to begin.
            </div>
        )
    }

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <LiveSummaryBar logs={activityFeed} />
            <div className="flex-1 overflow-auto bg-background/50">
                {grouped.map((item) =>
                    isActionGroup(item) ? (
                        <ActionBlock key={item.id} action={item} />
                    ) : (
                        <TextBlock key={item.id} log={item} />
                    )
                )}
                <div ref={bottomRef} />
            </div>
        </div>
    )
}
