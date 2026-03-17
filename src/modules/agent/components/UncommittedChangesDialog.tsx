import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { X, Archive, GitCommit, Loader2, AlertTriangle } from 'lucide-react'
import type { FileChange } from '@/shared/types/review'

interface UncommittedChangesDialogProps {
    files: FileChange[]
    onStash: () => Promise<void>
    onCommit: (message: string) => Promise<void>
    onCancel: () => void
}

export function UncommittedChangesDialog({ files, onStash, onCommit, onCancel }: UncommittedChangesDialogProps) {
    const [mode, setMode] = useState<'choose' | 'commit'>('choose')
    const [commitMessage, setCommitMessage] = useState('')
    const [loading, setLoading] = useState(false)

    const handleStash = async () => {
        setLoading(true)
        try {
            await onStash()
        } finally {
            setLoading(false)
        }
    }

    const handleCommit = async () => {
        if (!commitMessage.trim()) return
        setLoading(true)
        try {
            await onCommit(commitMessage)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4">
                <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-[var(--color-sidebar)]">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        <h3 className="font-semibold text-sm">Uncommitted Changes</h3>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCancel} disabled={loading}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <div className="p-5 space-y-4">
                    <p className="text-sm text-muted-foreground">
                        You have {files.length} uncommitted file{files.length !== 1 ? 's' : ''}. These must be handled before starting the build loop.
                    </p>

                    {/* File list */}
                    <div className="max-h-32 overflow-auto rounded-md border border-border bg-muted/30 p-2 space-y-0.5">
                        {files.map((f) => (
                            <div key={f.path} className="flex items-center gap-2 text-xs font-mono">
                                <span className={
                                    f.status === 'new' ? 'text-emerald-600 dark:text-emerald-400' :
                                    f.status === 'deleted' ? 'text-rose-600 dark:text-rose-400' :
                                    f.status === 'renamed' ? 'text-sky-600 dark:text-sky-400' :
                                    'text-amber-600 dark:text-amber-400'
                                }>
                                    {f.status === 'new' ? 'A' : f.status === 'deleted' ? 'D' : f.status === 'renamed' ? 'R' : 'M'}
                                </span>
                                <span className="truncate text-foreground">{f.path}</span>
                            </div>
                        ))}
                    </div>

                    {mode === 'commit' && (
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Commit message
                            </label>
                            <textarea
                                value={commitMessage}
                                onChange={(e) => setCommitMessage(e.target.value)}
                                placeholder="Describe your changes..."
                                className="w-full h-20 px-3 py-2 text-sm font-mono rounded-md border border-border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                                autoFocus
                            />
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
                    <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
                        Cancel
                    </Button>
                    {mode === 'choose' ? (
                        <>
                            <Button variant="outline" size="sm" onClick={handleStash} disabled={loading}>
                                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Archive className="h-3.5 w-3.5 mr-1.5" />}
                                Stash Changes
                            </Button>
                            <Button size="sm" onClick={() => setMode('commit')} disabled={loading}>
                                <GitCommit className="h-3.5 w-3.5 mr-1.5" />
                                Commit Changes
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="outline" size="sm" onClick={() => setMode('choose')} disabled={loading}>
                                Back
                            </Button>
                            <Button size="sm" onClick={handleCommit} disabled={!commitMessage.trim() || loading}>
                                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <GitCommit className="h-3.5 w-3.5 mr-1.5" />}
                                Commit & Continue
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
