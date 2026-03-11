import { useEffect, useMemo, useRef } from 'react'
import { ActionBlock } from './ActionBlock'
import { TextBlock } from './TextBlock'
import { LiveSummaryBar } from './LiveSummaryBar'
import { groupActions } from '../utils/parseActivity'
import { isActionGroup } from '@/shared/types/activity'
import { useRelayStore } from '@/store/useRelayStore'

export function AgentActivityFeed() {
    const { activityFeed } = useRelayStore()
    const bottomRef = useRef<HTMLDivElement>(null)

    const grouped = useMemo(() => groupActions(activityFeed), [activityFeed])

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
            <div className="flex-1 overflow-auto">
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
