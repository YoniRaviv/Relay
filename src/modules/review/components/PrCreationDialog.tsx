import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, GitPullRequest, Loader2, ExternalLink, Check } from 'lucide-react'
import { useRelayStore } from '@/store/useRelayStore'
import type { Task } from '@shared/types'

interface PrCreationDialogProps {
    onClose: (createdUrl?: string) => void
}

function generatePrBody(tasks: Task[]): string {
    const completed = tasks.filter(t => t.status === 'done')
    const lines = completed.map(t => `- **${t.storyId}**: ${t.title}`)
    return `## Summary\n\nThis PR implements the following tasks:\n\n${lines.join('\n')}\n\n## Changes\n\n${completed.length} task${completed.length !== 1 ? 's' : ''} completed and reviewed.\n`
}

export function PrCreationDialog({ onClose }: PrCreationDialogProps) {
    const { activeProject, tasks, featureBranch, baseBranch, prd, features, activePrdId } = useRelayStore()

    const prdTitle = prd?.description ?? features.find(f => f.id === activePrdId)?.description ?? 'Feature'

    const [title, setTitle] = useState(prdTitle)
    const [body, setBody] = useState(generatePrBody(tasks))
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [prUrl, setPrUrl] = useState<string | null>(null)

    const targetBase = baseBranch ?? 'main'

    const handleCreate = async () => {
        if (!activeProject || !title.trim()) return
        setLoading(true)
        setError(null)
        try {
            const result = await window.relayAPI.gitCreatePr(activeProject.id, title, body, targetBase)
            setPrUrl(result.url)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create PR. Make sure `gh` CLI is installed and authenticated.')
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg mx-4">
                <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-[var(--color-sidebar)]">
                    <div className="flex items-center gap-2">
                        <GitPullRequest className="h-4 w-4 text-muted-foreground" />
                        <h3 className="font-semibold text-sm">
                            {prUrl ? 'Pull Request Created' : 'Create Pull Request'}
                        </h3>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onClose()}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {prUrl ? (
                    <div className="p-5 space-y-4">
                        <div className="flex items-center gap-3 p-4 rounded-md bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/20 dark:border-emerald-500/30">
                            <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                                    Pull request created successfully!
                                </p>
                                <a
                                    href={prUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1 break-all"
                                    onClick={(e) => {
                                        e.preventDefault()
                                        window.open(prUrl, '_blank')
                                    }}
                                >
                                    {prUrl}
                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                </a>
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <Button size="sm" onClick={() => onClose(prUrl ?? undefined)}>Done</Button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="p-5 space-y-4">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span className="font-mono">{featureBranch ?? 'current'}</span>
                                <span>&rarr;</span>
                                <span className="font-mono">{targetBase}</span>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Title
                                </Label>
                                <Input
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="text-sm"
                                    placeholder="PR title"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Description
                                </Label>
                                <textarea
                                    value={body}
                                    onChange={(e) => setBody(e.target.value)}
                                    className="w-full h-40 px-3 py-2 text-sm font-mono rounded-md border border-border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                            </div>

                            {error && (
                                <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
                                    <p className="text-xs text-destructive font-medium">{error}</p>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
                            <Button variant="outline" size="sm" onClick={() => onClose()} disabled={loading}>
                                Skip
                            </Button>
                            <Button size="sm" onClick={handleCreate} disabled={!title.trim() || loading}>
                                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <GitPullRequest className="h-3.5 w-3.5 mr-1.5" />}
                                Create PR
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
