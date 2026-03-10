import { useState, useEffect } from 'react'
import { useRelayStore } from '@/store/useRelayStore'
import { Timer } from 'lucide-react'

function formatElapsed(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

export function BuildTimer() {
    const { buildStartTime, loopState } = useRelayStore()
    const [elapsed, setElapsed] = useState(0)

    useEffect(() => {
        if (!buildStartTime || loopState !== 'running') {
            setElapsed(0)
            return
        }

        const start = new Date(buildStartTime).getTime()
        const tick = () => setElapsed(Date.now() - start)
        tick()
        const interval = setInterval(tick, 1000)
        return () => clearInterval(interval)
    }, [buildStartTime, loopState])

    if (!buildStartTime || loopState !== 'running') return null

    return (
        <span className="flex items-center gap-1 text-[11px] font-mono text-primary">
            <Timer className="h-3 w-3" />
            {formatElapsed(elapsed)}
        </span>
    )
}
