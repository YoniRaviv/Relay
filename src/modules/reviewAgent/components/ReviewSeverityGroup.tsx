import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { ReviewFinding, ReviewSeverity } from '@shared/types'
import { ReviewFindingCard } from './ReviewFindingCard'

const severityLabels: Record<ReviewSeverity, string> = {
    critical: 'Critical',
    warning: 'Warning',
    info: 'Info',
}

const severityHeaderColors: Record<ReviewSeverity, string> = {
    critical: 'text-red-400',
    warning: 'text-yellow-400',
    info: 'text-muted-foreground',
}

interface ReviewSeverityGroupProps {
    severity: ReviewSeverity
    findings: ReviewFinding[]
    selectedIds: Set<string>
    onToggle: (id: string) => void
    onToggleAll: (severity: ReviewSeverity, checked: boolean) => void
}

export function ReviewSeverityGroup({ severity, findings, selectedIds, onToggle, onToggleAll }: ReviewSeverityGroupProps) {
    const [expanded, setExpanded] = useState(true)
    const allChecked = findings.every(f => selectedIds.has(f.id))
    const someChecked = findings.some(f => selectedIds.has(f.id))

    if (findings.length === 0) return null

    return (
        <div>
            <div className="flex items-center gap-2 px-4 py-2">
                <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1">
                    {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
                <input
                    type="checkbox"
                    checked={allChecked}
                    ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
                    onChange={() => onToggleAll(severity, !allChecked)}
                    className="accent-emerald-500"
                />
                <span className={`text-[11px] font-bold uppercase tracking-wider ${severityHeaderColors[severity]}`}>
                    {severityLabels[severity]} ({findings.length})
                </span>
            </div>
            {expanded && findings.map(f => (
                <ReviewFindingCard
                    key={f.id}
                    finding={f}
                    checked={selectedIds.has(f.id)}
                    onToggle={onToggle}
                />
            ))}
        </div>
    )
}
