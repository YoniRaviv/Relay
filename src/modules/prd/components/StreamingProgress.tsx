import React, { useEffect, useState } from 'react'
import { Check } from 'lucide-react'

const AGENT_PHASES = [
    { key: 'spawn', label: 'Starting', match: /spawn|starting/i },
    { key: 'connect', label: 'Analyzing', match: /connect|analyz/i },
    { key: 'write', label: 'Writing', match: /writ|document|final/i },
]

function getPhaseIndex(status: string): number {
    for (let i = AGENT_PHASES.length - 1; i >= 0; i--) {
        if (AGENT_PHASES[i].match.test(status)) return i
    }
    return -1
}

function StepCircle({ isDone, isActive }: { isDone: boolean; isActive: boolean }) {
    return (
        <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
            isDone ? 'bg-primary text-primary-foreground' :
            isActive ? 'bg-primary/15 border-2 border-primary' :
            'bg-muted border-2 border-border'
        }`}>
            {isDone ? (
                <Check className="h-3 w-3" />
            ) : isActive ? (
                <div className="h-2.5 w-2.5 border-[1.5px] border-primary border-t-transparent rounded-full animate-spin" />
            ) : null}
        </div>
    )
}

export function StreamingProgress({ agentStatus, hasContent, complete }: { agentStatus?: string; hasContent: boolean; complete: boolean }) {
    const [highWater, setHighWater] = useState(0)

    useEffect(() => {
        if (complete) {
            setHighWater(AGENT_PHASES.length - 1)
            return
        }
        const contentMin = hasContent ? 2 : 0
        const fromStatus = agentStatus ? getPhaseIndex(agentStatus) : -1
        const newIndex = Math.max(contentMin, fromStatus, 0)
        setHighWater(prev => Math.max(prev, newIndex))
    }, [agentStatus, hasContent, complete])

    useEffect(() => {
        if (!hasContent && !agentStatus && !complete) {
            setHighWater(0)
        }
    }, [hasContent, agentStatus, complete])

    const activeIndex = complete ? AGENT_PHASES.length : highWater

    const items: React.ReactNode[] = []
    AGENT_PHASES.forEach((phase, i) => {
        const isDone = complete ? true : i < activeIndex
        const isActive = !complete && i === activeIndex

        items.push(
            <div key={phase.key} className="flex flex-col items-center gap-1.5 shrink-0">
                <StepCircle isDone={isDone} isActive={isActive} />
                <span className={`text-[11px] whitespace-nowrap transition-colors ${
                    isActive ? 'text-foreground font-medium' :
                    isDone ? 'text-foreground/60' :
                    'text-muted-foreground/40'
                }`}>
                    {phase.label}
                </span>
            </div>
        )

        if (i < AGENT_PHASES.length - 1) {
            const lineDone = complete ? true : i < activeIndex
            items.push(
                <div key={`line-${i}`} className={`h-px mt-3 transition-colors duration-300 ${
                    lineDone ? 'bg-primary' : 'bg-border'
                }`} style={{ flex: '1 1 0', minWidth: 0 }} />
            )
        }
    })

    return (
        <div className="flex items-start py-3 mb-4 overflow-hidden">
            {items}
        </div>
    )
}
