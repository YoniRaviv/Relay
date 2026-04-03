import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ReviewFinding } from '@shared/types'
import { ReviewFindingCard } from './ReviewFindingCard'

const REVIEW_CATEGORIES = [
    'Security vulnerabilities',
    'Performance issues',
    'Race conditions',
    'Error handling gaps',
    'Convention violations',
    'Best practice checks',
    'Accessibility concerns',
]

interface ReviewAnalyzingStateProps {
    progress: string
    streamedFindings: ReviewFinding[]
    onCancel: () => void
}

export function ReviewAnalyzingState({ progress, streamedFindings, onCancel }: ReviewAnalyzingStateProps) {
    const [activeCategory, setActiveCategory] = useState(0)

    useEffect(() => {
        const interval = setInterval(() => {
            setActiveCategory(prev => (prev + 1) % REVIEW_CATEGORIES.length)
        }, 2000)
        return () => clearInterval(interval)
    }, [])

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {streamedFindings.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
                    {/* Animated scanner icon */}
                    <div className="relative">
                        <div className="rounded-full bg-muted p-5">
                            <Search className="h-10 w-10 text-primary animate-pulse" />
                        </div>
                        <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" style={{ animationDuration: '2s' }} />
                    </div>

                    <div className="text-center">
                        <h3 className="text-[15px] font-semibold mb-2">Analyzing Code</h3>
                        <p className="text-[13px] text-muted-foreground mb-5">{progress || 'Starting analysis...'}</p>

                        {/* Category list with sliding highlight */}
                        <div className="flex flex-col gap-2 text-left max-w-xs mx-auto">
                            {REVIEW_CATEGORIES.map((cat, i) => (
                                <div
                                    key={cat}
                                    className={`flex items-center gap-2.5 text-[12px] transition-all duration-700 ${
                                        i === activeCategory
                                            ? 'text-primary font-medium'
                                            : 'text-muted-foreground/40'
                                    }`}
                                >
                                    <div className={`h-1 w-1 rounded-full shrink-0 transition-all duration-700 ${
                                        i === activeCategory ? 'bg-primary scale-150' : 'bg-muted-foreground/30'
                                    }`} />
                                    {cat}
                                </div>
                            ))}
                        </div>
                    </div>

                    <Button size="sm" variant="outline" className="text-xs" onClick={onCancel}>
                        Cancel
                    </Button>
                </div>
            ) : (
                <>
                    <div className="flex items-center gap-3 px-5 py-3 border-b border-border/30">
                        <Search className="h-4 w-4 text-primary animate-pulse" />
                        <span className="text-[13px] text-muted-foreground">{progress || 'Analyzing...'}</span>
                        <Button size="sm" variant="ghost" className="ml-auto text-xs" onClick={onCancel}>
                            Cancel
                        </Button>
                    </div>
                    <div className="flex-1 overflow-auto py-2">
                        <p className="px-5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                            Findings so far ({streamedFindings.length})
                        </p>
                        {streamedFindings.map(f => (
                            <ReviewFindingCard key={f.id} finding={f} checked={false} onToggle={() => {}} />
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}
