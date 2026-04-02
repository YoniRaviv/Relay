import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import type { ReviewFinding, ReviewSeverity } from '@shared/types'
import { ReviewSeverityGroup } from './ReviewSeverityGroup'

interface ReviewFindingsListProps {
    findings: ReviewFinding[]
    stackProfile: string
    onFix: (selectedIds: string[]) => void
    onRerun: () => void
}

export function ReviewFindingsList({ findings, stackProfile, onFix, onRerun }: ReviewFindingsListProps) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
        const initial = new Set<string>()
        for (const f of findings) {
            if (f.severity === 'critical' || f.severity === 'warning') initial.add(f.id)
        }
        return initial
    })

    const grouped = useMemo(() => {
        const groups: Record<ReviewSeverity, ReviewFinding[]> = {
            critical: [],
            warning: [],
            info: [],
        }
        for (const f of findings) {
            groups[f.severity].push(f)
        }
        return groups
    }, [findings])

    const counts = {
        critical: grouped.critical.length,
        warning: grouped.warning.length,
        info: grouped.info.length,
    }

    const toggleOne = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const toggleAll = (severity: ReviewSeverity, checked: boolean) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            for (const f of grouped[severity]) {
                if (checked) next.add(f.id)
                else next.delete(f.id)
            }
            return next
        })
    }

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-5 py-3 border-b border-border/30">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-[15px] font-bold">Code Review</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">Detected: {stackProfile}</div>
                    </div>
                    <div className="flex items-center gap-2">
                        {counts.critical > 0 && (
                            <span className="bg-red-950 text-red-300 text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                                {counts.critical} Critical
                            </span>
                        )}
                        {counts.warning > 0 && (
                            <span className="bg-yellow-950 text-yellow-300 text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                                {counts.warning} Warning
                            </span>
                        )}
                        {counts.info > 0 && (
                            <span className="bg-slate-800 text-slate-400 text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                                {counts.info} Info
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Findings */}
            <div className="flex-1 overflow-auto py-2">
                <ReviewSeverityGroup severity="critical" findings={grouped.critical} selectedIds={selectedIds} onToggle={toggleOne} onToggleAll={toggleAll} />
                <ReviewSeverityGroup severity="warning" findings={grouped.warning} selectedIds={selectedIds} onToggle={toggleOne} onToggleAll={toggleAll} />
                <ReviewSeverityGroup severity="info" findings={grouped.info} selectedIds={selectedIds} onToggle={toggleOne} onToggleAll={toggleAll} />
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-border/30 flex items-center justify-between">
                <span className="text-[12px] text-muted-foreground">
                    {selectedIds.size} of {findings.length} findings selected
                </span>
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="text-xs" onClick={onRerun}>
                        Re-run
                    </Button>
                    <Button
                        size="sm"
                        className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        disabled={selectedIds.size === 0}
                        onClick={() => onFix(Array.from(selectedIds))}
                    >
                        Fix Selected ({selectedIds.size})
                    </Button>
                </div>
            </div>
        </div>
    )
}
