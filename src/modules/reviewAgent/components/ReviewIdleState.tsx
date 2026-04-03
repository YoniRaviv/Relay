import { Button } from '@/components/ui/button'
import { Search } from 'lucide-react'
import { ModelSelect } from '@/shared/components/ModelSelect'

interface ReviewIdleStateProps {
    onStart: () => void
}

export function ReviewIdleState({ onStart }: ReviewIdleStateProps) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
            <div className="rounded-full bg-muted p-4">
                <Search className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
                <h3 className="text-lg font-semibold mb-1">Code Review</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                    Analyzes your feature changes for security issues, performance problems, race conditions, and convention violations.
                </p>
            </div>

            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <span>Model:</span>
                <ModelSelect direction="up" align="center" />
            </div>

            <Button onClick={onStart} className="gap-2">
                <Search className="h-4 w-4" />
                Start Code Review
            </Button>
        </div>
    )
}
