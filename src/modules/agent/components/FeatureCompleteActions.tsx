import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ExternalLink, Globe, GitPullRequest, Loader2, FileDown, CheckCircle2, Clock, Zap, Archive } from 'lucide-react'
import { toast } from 'sonner'
import { useRelayStore } from '@/store/useRelayStore'

interface FeatureCompleteActionsProps {
    prUrl: string | null
    hasRemote: boolean | null
    prChecked: boolean
    onShowPrDialog: () => void
    onArchiveFeature?: () => void
}

export function FeatureCompleteActions({ prUrl, hasRemote, prChecked, onShowPrDialog, onArchiveFeature }: FeatureCompleteActionsProps) {
    const activeProject = useRelayStore((s) => s.activeProject)
    const tasks = useRelayStore((s) => s.tasks)
    const activePrdId = useRelayStore((s) => s.activePrdId)
    const [showRemoteInput, setShowRemoteInput] = useState(false)
    const [remoteUrl, setRemoteUrl] = useState('')
    const [addingRemote, setAddingRemote] = useState(false)
    const [localHasRemote, setLocalHasRemote] = useState(hasRemote)
    const [showSummary, setShowSummary] = useState(false)

    if (!prChecked) return null

    // Summary stats
    const totalTasks = tasks.length
    const humanApproved = tasks.filter(t => (t as unknown as Record<string, unknown>).approved_by === 'human').length
    const autoApproved = totalTasks - humanApproved
    const totalPasses = tasks.reduce((sum, t) => sum + (t.passes || 0), 0)

    const handleExport = async () => {
        if (!activeProject || !activePrdId) return
        try {
            const { markdown } = await window.relayAPI.prdExportMarkdown(activeProject.id, activePrdId)
            await navigator.clipboard.writeText(markdown)
            toast.success('Copied to clipboard', { description: 'PRD + tasks exported as Markdown' })
        } catch {
            toast.error('Export failed')
        }
    }

    const renderPrButton = () => {
        if (prUrl) {
            return (
                <Button
                    size="sm"
                    className="h-7 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => window.open(prUrl, '_blank')}
                >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View PR
                </Button>
            )
        }

        if (localHasRemote === false || hasRemote === false) {
            return (
                <div className="relative">
                    <Button
                        size="sm"
                        className="h-7 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => setShowRemoteInput(!showRemoteInput)}
                    >
                        <Globe className="h-3.5 w-3.5" />
                        Add Remote
                    </Button>
                    {showRemoteInput && (
                        <form
                            className="absolute top-full right-0 mt-1 w-80 rounded-lg bg-card border border-border shadow-xl z-50 p-3 space-y-2"
                            onSubmit={async (e) => {
                                e.preventDefault()
                                if (!activeProject || !remoteUrl.trim()) return
                                setAddingRemote(true)
                                try {
                                    await window.relayAPI.gitAddRemote(activeProject.id, remoteUrl.trim())
                                    setLocalHasRemote(true)
                                    setShowRemoteInput(false)
                                    setRemoteUrl('')
                                    toast.success('Remote added')
                                } catch (err) {
                                    toast.error('Failed to add remote', { description: err instanceof Error ? err.message : 'Unknown error' })
                                } finally {
                                    setAddingRemote(false)
                                }
                            }}
                        >
                            <p className="text-[11px] font-medium text-muted-foreground">Repository URL</p>
                            <input
                                type="text"
                                value={remoteUrl}
                                onChange={(e) => setRemoteUrl(e.target.value)}
                                placeholder="https://github.com/user/repo.git"
                                className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                autoFocus
                            />
                            <div className="flex justify-end gap-1.5">
                                <Button size="sm" variant="ghost" className="h-7 text-xs" type="button" onClick={() => { setShowRemoteInput(false); setRemoteUrl('') }}>
                                    Cancel
                                </Button>
                                <Button size="sm" type="submit" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" disabled={!remoteUrl.trim() || addingRemote}>
                                    {addingRemote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add Remote'}
                                </Button>
                            </div>
                        </form>
                    )}
                </div>
            )
        }

        return (
            <Button
                size="sm"
                className="h-7 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={onShowPrDialog}
            >
                <GitPullRequest className="h-3.5 w-3.5" />
                Create PR
            </Button>
        )
    }

    return (
        <>
            <div className="flex items-center gap-1.5">
                <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={() => setShowSummary(!showSummary)}
                >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    {totalTasks} tasks
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={handleExport}
                >
                    <FileDown className="h-3.5 w-3.5" />
                    Export
                </Button>
                {renderPrButton()}
                {onArchiveFeature && prUrl && (
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-xs"
                        onClick={onArchiveFeature}
                    >
                        <Archive className="h-3.5 w-3.5" />
                        Archive
                    </Button>
                )}
            </div>

            {/* Summary popover */}
            {showSummary && (
                <div className="absolute top-full right-0 mt-1 w-64 rounded-lg bg-card border border-border shadow-xl z-50 p-3 space-y-2">
                    <h4 className="text-xs font-semibold">Feature Summary</h4>
                    <div className="space-y-1.5 text-[11px] text-muted-foreground">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                            <span>{totalTasks} tasks completed</span>
                        </div>
                        {humanApproved > 0 && (
                            <div className="flex items-center gap-2">
                                <Clock className="h-3 w-3" />
                                <span>{humanApproved} manually reviewed</span>
                            </div>
                        )}
                        {autoApproved > 0 && (
                            <div className="flex items-center gap-2">
                                <Zap className="h-3 w-3" />
                                <span>{autoApproved} auto-approved</span>
                            </div>
                        )}
                        {totalPasses > totalTasks && (
                            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                                <span>{totalPasses - totalTasks} retries needed</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    )
}
