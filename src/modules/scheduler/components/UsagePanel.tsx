import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, BarChart3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCost, formatNumber } from '@/shared/formatters'
import type { UsageSummary } from '@/shared/types/scheduler'

interface UsagePanelProps {
    onClose: () => void
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex-1 p-3 rounded-lg bg-muted/40 text-center">
            <p className="text-lg font-semibold tabular-nums">{value}</p>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
        </div>
    )
}

/** Global cost/usage over all scheduler runs: totals, per playbook, top jobs, daily trend. */
export function UsagePanel({ onClose }: UsagePanelProps) {
    const [usage, setUsage] = useState<UsageSummary | null>(null)

    useEffect(() => {
        void window.relayAPI.scheduler.usage().then(setUsage)
    }, [])

    const totals = usage?.jobs.reduce(
        (acc, j) => ({ runs: acc.runs + j.runs, tokens: acc.tokens + j.tokens, costUsd: acc.costUsd + j.costUsd }),
        { runs: 0, tokens: 0, costUsd: 0 },
    )

    const row = 'flex items-center gap-2 text-[12px] py-1.5 border-b border-border/30 last:border-0'

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-xl mx-4 max-h-[85vh] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-[var(--color-sidebar)]">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-muted-foreground" />
                        <h3 className="font-semibold text-sm">Scheduler Usage</h3>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <div className="p-5 space-y-5 overflow-y-auto min-h-0">
                    {!usage ? (
                        <p className="text-sm text-muted-foreground">Loading…</p>
                    ) : usage.jobs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No runs yet — usage appears after the first job runs.</p>
                    ) : (
                        <>
                            <div className="flex gap-3">
                                <Stat label="runs" value={formatNumber(totals!.runs)} />
                                <Stat label="tokens" value={formatNumber(totals!.tokens)} />
                                <Stat label="cost" value={formatCost(totals!.costUsd)} />
                            </div>

                            {usage.playbooks.length > 0 && (
                                <div>
                                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">By Playbook</h4>
                                    {usage.playbooks.map((p) => (
                                        <div key={p.playbookId} className={row}>
                                            <span className="truncate text-foreground/90">{p.name}</span>
                                            <span className="ml-auto shrink-0 text-muted-foreground">{p.runs} runs</span>
                                            <span className="shrink-0 text-muted-foreground">{formatNumber(p.tokens)} tok</span>
                                            <span className="shrink-0 w-16 text-right">{formatCost(p.costUsd)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div>
                                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Top Jobs</h4>
                                {usage.jobs.slice(0, 10).map((j) => (
                                    <div key={j.jobId} className={row}>
                                        <span className="truncate text-foreground/90">{j.name}</span>
                                        <span className="ml-auto shrink-0 text-muted-foreground">{j.runs} runs</span>
                                        <span className="shrink-0 text-muted-foreground">{formatNumber(j.tokens)} tok</span>
                                        <span className="shrink-0 w-16 text-right">{formatCost(j.costUsd)}</span>
                                    </div>
                                ))}
                            </div>

                            {usage.daily.length > 0 && (
                                <div>
                                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Last 14 Days</h4>
                                    {usage.daily.map((d) => (
                                        <div key={d.day} className={row}>
                                            <span className="font-mono text-foreground/90">{d.day}</span>
                                            <span className="ml-auto shrink-0 text-muted-foreground">{d.runs} runs</span>
                                            <span className="shrink-0 text-muted-foreground">{formatNumber(d.tokens)} tok</span>
                                            <span className="shrink-0 w-16 text-right">{formatCost(d.costUsd)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    )
}
