import { CheckCircle2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ReviewSession } from '@shared/types'
import { calculateCost, getModelLabel } from '@shared/pricing'
import { formatDuration, formatCost } from '@/shared/formatters'

interface ReviewCompleteStateProps {
    session: ReviewSession
    onRerun: () => void
    onCreatePr: () => void
}

export function ReviewCompleteState({ session, onRerun, onCreatePr }: ReviewCompleteStateProps) {
    const hasFindings = session.findings.length > 0
    const fixedCount = session.selectedIds.length
    const cost = calculateCost(session.tokensIn, session.tokensOut, session.model)

    return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <div>
                <h3 className="text-lg font-semibold mb-1">
                    {hasFindings
                        ? `${fixedCount} issue${fixedCount !== 1 ? 's' : ''} fixed`
                        : 'No issues found'}
                </h3>
                <p className="text-sm text-muted-foreground">
                    {hasFindings
                        ? 'All selected fixes have been applied and committed.'
                        : 'Your code looks clean — ready to ship!'}
                </p>
            </div>

            <div className="flex gap-4 text-[11px] text-muted-foreground">
                <span>{formatDuration(session.durationMs)}</span>
                <span>{(session.tokensIn + session.tokensOut).toLocaleString()} tokens</span>
                <span>{formatCost(cost)}</span>
                <span>{getModelLabel(session.model)}</span>
            </div>

            <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={onRerun}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Review Again
                </Button>
                <Button
                    size="sm"
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={onCreatePr}
                >
                    Create PR
                </Button>
            </div>
        </div>
    )
}
