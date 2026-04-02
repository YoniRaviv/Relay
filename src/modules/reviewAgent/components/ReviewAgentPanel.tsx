import { useEffect, useState } from 'react'
import { useRelayStore } from '@/store/useRelayStore'
import { useIpcListener } from '@/shared/hooks/useIpcListener'
import { ReviewIdleState } from './ReviewIdleState'
import { ReviewAnalyzingState } from './ReviewAnalyzingState'
import { ReviewFindingsList } from './ReviewFindingsList'
import { ReviewFixingState } from './ReviewFixingState'
import { ReviewCompleteState } from './ReviewCompleteState'
import type { ReviewFinding, ReviewSession } from '@shared/types'

interface ReviewAgentPanelProps {
    onShowPrDialog: () => void
}

export function ReviewAgentPanel({ onShowPrDialog }: ReviewAgentPanelProps) {
    const activePrdId = useRelayStore((s) => s.activePrdId)
    const reviewSession = useRelayStore((s) => s.reviewSession)
    const reviewAgentState = useRelayStore((s) => s.reviewAgentState)
    const reviewProgress = useRelayStore((s) => s.reviewProgress)
    const setReviewSession = useRelayStore((s) => s.setReviewSession)
    const setReviewAgentState = useRelayStore((s) => s.setReviewAgentState)
    const setReviewProgress = useRelayStore((s) => s.setReviewProgress)

    const [streamedFindings, setStreamedFindings] = useState<ReviewFinding[]>([])

    // Load existing session on mount
    useEffect(() => {
        if (!activePrdId) return
        window.relayAPI.reviewAgentGetSession(activePrdId).then((session: ReviewSession | null) => {
            if (session) {
                setReviewSession(session)
                if (session.status === 'findings') setReviewAgentState('findings')
                else if (session.status === 'complete') setReviewAgentState('complete')
                else setReviewAgentState('idle')
            } else {
                setReviewAgentState('idle')
            }
        })
    }, [activePrdId, setReviewSession, setReviewAgentState])

    useIpcListener('reviewAgent:status', (data: unknown) => {
        const { text } = data as { text: string }
        setReviewProgress(text)
    })

    useIpcListener('reviewAgent:findingStream', (data: unknown) => {
        const finding = data as ReviewFinding
        setStreamedFindings(prev => [...prev, finding])
    })

    useIpcListener('reviewAgent:fixProgress', (data: unknown) => {
        const { file, action } = data as { file: string; action: string }
        setReviewProgress(`${action}: ${file}`)
    })

    useIpcListener('reviewAgent:complete', (data: unknown) => {
        const session = data as ReviewSession
        setReviewSession(session)
        if (session.status === 'findings') {
            setReviewAgentState('findings')
        } else if (session.status === 'complete') {
            setReviewAgentState('complete')
        } else {
            setReviewAgentState('idle')
        }
    })

    const handleStart = async () => {
        if (!activePrdId) return
        setReviewAgentState('analyzing')
        setStreamedFindings([])
        setReviewProgress('Starting analysis...')
        try {
            await window.relayAPI.reviewAgentAnalyze(activePrdId)
        } catch {
            setReviewAgentState('idle')
        }
    }

    const handleFix = async (selectedIds: string[]) => {
        if (!reviewSession) return
        setReviewAgentState('fixing')
        setReviewProgress('Starting fixes...')
        try {
            await window.relayAPI.reviewAgentFix(reviewSession.id, selectedIds)
        } catch {
            setReviewAgentState('findings')
        }
    }

    const handleCancel = () => {
        window.relayAPI.reviewAgentCancel()
        setReviewAgentState('idle')
    }

    const handleRerun = () => {
        setReviewSession(null)
        handleStart()
    }

    return (
        <div className="flex flex-col h-full">
            {reviewAgentState === 'idle' && (
                <ReviewIdleState onStart={handleStart} />
            )}
            {reviewAgentState === 'analyzing' && (
                <ReviewAnalyzingState
                    progress={reviewProgress}
                    streamedFindings={streamedFindings}
                    onCancel={handleCancel}
                />
            )}
            {reviewAgentState === 'findings' && reviewSession && (
                <ReviewFindingsList
                    findings={reviewSession.findings}
                    stackProfile={reviewSession.stackProfile}
                    onFix={handleFix}
                    onRerun={handleRerun}
                />
            )}
            {reviewAgentState === 'fixing' && (
                <ReviewFixingState progress={reviewProgress} onCancel={handleCancel} />
            )}
            {reviewAgentState === 'complete' && reviewSession && (
                <ReviewCompleteState
                    session={reviewSession}
                    onRerun={handleRerun}
                    onCreatePr={onShowPrDialog}
                />
            )}
        </div>
    )
}
