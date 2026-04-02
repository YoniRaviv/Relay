import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ReviewFixingStateProps {
    progress: string
    onCancel: () => void
}

export function ReviewFixingState({ progress, onCancel }: ReviewFixingStateProps) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div>
                <h3 className="text-[15px] font-semibold mb-1">Applying Fixes</h3>
                <p className="text-[13px] text-muted-foreground">{progress || 'Working...'}</p>
            </div>
            <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
    )
}
