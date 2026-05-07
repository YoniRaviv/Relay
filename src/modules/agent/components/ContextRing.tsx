import { useEffect, useState } from 'react'
import { useIpcListener } from '@/shared/hooks/useIpcListener'

interface TokenSnapshot {
    taskId: string
    inputTokens: number
    outputTokens: number
    contextWindow: number
}

interface ContextRingProps {
    taskId: string
    size?: number
}

export function ContextRing({ taskId, size = 18 }: ContextRingProps) {
    const [maxInputTokens, setMaxInputTokens] = useState(0)
    const [contextWindow, setContextWindow] = useState(200_000)

    useEffect(() => {
        setMaxInputTokens(0)
    }, [taskId])

    useIpcListener(
        'agent:tokens',
        (data: unknown) => {
            const snap = data as TokenSnapshot
            if (snap.taskId !== taskId) return
            setMaxInputTokens((prev) => Math.max(prev, snap.inputTokens))
            if (snap.contextWindow) setContextWindow(snap.contextWindow)
        },
        [taskId],
    )

    if (maxInputTokens === 0) return null

    const fraction = Math.max(0, Math.min(1, maxInputTokens / contextWindow))
    const pct = Math.round(fraction * 100)
    const stroke = size <= 14 ? 1.5 : 2
    const radius = (size - stroke) / 2
    const circumference = 2 * Math.PI * radius
    const dashOffset = circumference * (1 - fraction)

    const colorClass =
        fraction > 0.85
            ? 'text-rose-500'
            : fraction > 0.6
                ? 'text-amber-500'
                : 'text-emerald-500'

    return (
        <span
            title={`Context: ${pct}% (${maxInputTokens.toLocaleString()} / ${contextWindow.toLocaleString()} tokens)`}
            className="inline-flex items-center"
        >
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={colorClass}>
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={stroke}
                    strokeOpacity={0.18}
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
            </svg>
        </span>
    )
}
