import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ReviewFinding } from '@shared/types'

const severityColors = {
    critical: { border: 'border-l-red-500', badge: 'bg-red-500/15 text-red-400' },
    warning: { border: 'border-l-yellow-500', badge: 'bg-yellow-500/15 text-yellow-400' },
    info: { border: 'border-l-slate-500', badge: 'bg-slate-500/15 text-slate-400' },
}

interface ReviewFindingCardProps {
    finding: ReviewFinding
    checked: boolean
    onToggle: (id: string) => void
}

export function ReviewFindingCard({ finding, checked, onToggle }: ReviewFindingCardProps) {
    const [expanded, setExpanded] = useState(false)
    const colors = severityColors[finding.severity]

    return (
        <div className={`mx-4 mb-2 rounded-lg border border-border/40 border-l-[3px] ${colors.border} bg-card/50`}>
            {/* Header row — always visible */}
            <div className="flex items-center gap-2.5 px-3 py-2.5">
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(finding.id)}
                    className="shrink-0 accent-emerald-500"
                />
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="flex-1 flex items-start gap-2 text-left min-w-0"
                >
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${colors.badge}`}>
                                {finding.category}
                            </span>
                            <span className="text-[10px] text-muted-foreground/60 truncate">
                                {finding.file}:{finding.line}
                            </span>
                        </div>
                        <span className="text-[13px] font-medium leading-snug">{finding.title}</span>
                    </div>
                    {expanded
                        ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
                        : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
                    }
                </button>
            </div>

            {/* Expanded details */}
            {expanded && (
                <div className="px-3 pb-3 ml-8 space-y-1.5">
                    <p className="text-[12px] text-muted-foreground leading-relaxed">
                        {finding.description}
                    </p>
                    {finding.suggestion && (
                        <p className="text-[11px] text-emerald-500/80 leading-relaxed">
                            Suggested fix: {finding.suggestion}
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}
