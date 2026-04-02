import type { ReviewFinding } from '@shared/types'

const severityColors = {
    critical: { border: 'border-l-red-500', badge: 'bg-red-950 text-red-300' },
    warning: { border: 'border-l-yellow-500', badge: 'bg-yellow-950 text-yellow-300' },
    info: { border: 'border-l-slate-500', badge: 'bg-slate-800 text-slate-400' },
}

interface ReviewFindingCardProps {
    finding: ReviewFinding
    checked: boolean
    onToggle: (id: string) => void
}

export function ReviewFindingCard({ finding, checked, onToggle }: ReviewFindingCardProps) {
    const colors = severityColors[finding.severity]

    return (
        <div className={`mx-3 my-1 p-3 bg-muted/50 rounded-lg border-l-[3px] ${colors.border}`}>
            <div className="flex items-start gap-2.5">
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(finding.id)}
                    className="mt-0.5 accent-emerald-500"
                />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${colors.badge}`}>
                            {finding.category}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                            {finding.file}:{finding.line}
                        </span>
                    </div>
                    <div className="text-[13px] font-semibold mb-1">{finding.title}</div>
                    <div className="text-[12px] text-muted-foreground leading-relaxed">
                        {finding.description}
                    </div>
                    {finding.suggestion && (
                        <div className="text-[11px] text-muted-foreground/80 mt-1.5 italic">
                            Fix: {finding.suggestion}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
