import { useEffect, useRef } from 'react'
import { GitBranch } from 'lucide-react'
import { useRelayStore } from '@/store/useRelayStore'

const POLL_INTERVAL = 5_000

export function BranchIndicator() {
    const { activeProject, currentBranch, setCurrentBranch, setBranches } = useRelayStore()
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const fetchBranch = async () => {
        if (!activeProject) return
        try {
            const info = await window.relayAPI.gitBranch(activeProject.id)
            setCurrentBranch(info.current)
            setBranches(info.branches)
        } catch {
            setCurrentBranch(null)
            setBranches([])
        }
    }

    useEffect(() => {
        fetchBranch()
        intervalRef.current = setInterval(fetchBranch, POLL_INTERVAL)
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current)
        }
    }, [activeProject?.id]) // eslint-disable-line react-hooks/exhaustive-deps

    if (!currentBranch) return null

    return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/60 border border-border w-fit">
            <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[13px] font-mono text-foreground truncate max-w-[200px]">
                {currentBranch}
            </span>
        </div>
    )
}
