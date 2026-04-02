import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ReviewFinding } from '@shared/types'
import { ReviewFindingCard } from './ReviewFindingCard'

interface ReviewAnalyzingStateProps {
    progress: string
    streamedFindings: ReviewFinding[]
    onCancel: () => void
}

export function ReviewAnalyzingState({ progress, streamedFindings, onCancel }: ReviewAnalyzingStateProps) {
    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border/30">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-[13px] text-muted-foreground">{progress || 'Analyzing...'}</span>
                <Button size="sm" variant="ghost" className="ml-auto text-xs" onClick={onCancel}>
                    Cancel
                </Button>
            </div>
            {streamedFindings.length > 0 && (
                <div className="flex-1 overflow-auto py-2">
                    <p className="px-5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Findings so far ({streamedFindings.length})
                    </p>
                    {streamedFindings.map(f => (
                        <ReviewFindingCard key={f.id} finding={f} checked={false} onToggle={() => {}} />
                    ))}
                </div>
            )}
        </div>
    )
}
