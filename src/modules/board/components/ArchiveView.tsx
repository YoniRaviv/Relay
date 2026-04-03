import { useState } from 'react'
import { Archive, ArchiveRestore, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRelayStore, type FeatureSummary } from '@/store/useRelayStore'
import { extractTitle } from '@/shared/formatters'
import { FeatureDetail } from './FeatureDetail'

interface ArchiveViewProps {
    onUnarchive: (prdId: string) => void
}

export function ArchiveView({ onUnarchive }: ArchiveViewProps) {
    const archivedFeatures = useRelayStore(s => s.archivedFeatures)
    const [selectedFeature, setSelectedFeature] = useState<FeatureSummary | null>(null)

    if (selectedFeature) {
        return (
            <FeatureDetail
                feature={selectedFeature}
                onBack={() => setSelectedFeature(null)}
                onUnarchive={(prdId) => {
                    onUnarchive(prdId)
                    setSelectedFeature(null)
                }}
            />
        )
    }

    if (archivedFeatures.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
                <div className="rounded-full bg-muted p-4">
                    <Archive className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold mb-1">No archived features</h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                        Completed features can be archived from the sidebar to keep your workspace focused.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 overflow-auto h-full">
            <div className="flex items-center gap-2 mb-5">
                <Archive className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Archived Features</h2>
                <span className="text-xs text-muted-foreground">({archivedFeatures.length})</span>
            </div>

            <div className="grid gap-3">
                {archivedFeatures.map(f => (
                    <button
                        key={f.id}
                        onClick={() => setSelectedFeature(f)}
                        className="text-left w-full rounded-lg border border-border/50 p-4 hover:bg-muted/30 hover:border-border transition-colors overflow-hidden"
                    >
                        <div className="flex items-start justify-between gap-3 overflow-hidden">
                            <div className="min-w-0 flex-1 overflow-hidden">
                                <h3 className="text-sm font-medium mb-1 truncate max-w-full">{extractTitle(f.description, f.title)}</h3>
                                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                        <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                                        {f.taskCount} task{f.taskCount !== 1 ? 's' : ''}
                                    </span>
                                    {f.updatedAt && (
                                        <span>
                                            Archived {new Date(f.updatedAt).toLocaleDateString()}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="shrink-0 gap-1.5 text-xs h-7 text-muted-foreground hover:text-foreground"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onUnarchive(f.id)
                                }}
                            >
                                <ArchiveRestore className="h-3.5 w-3.5" />
                                Unarchive
                            </Button>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    )
}
