import { useEffect, useRef } from 'react'
import { ActivityMessage } from '@/components/ActivityMessage'
import { useRelayStore } from '@/store/useRelayStore'

export function AgentActivityFeed() {
  const { activityFeed } = useRelayStore()
  const bottomRef = useRef<HTMLDivElement>(null)

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
    <div className="flex-1 overflow-auto">
      {activityFeed.map((log) => (
        <ActivityMessage key={log.id} log={log} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
