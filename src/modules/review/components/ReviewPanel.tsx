import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { DiffViewer } from './DiffViewer'
import type { DiffViewerHandle } from './DiffViewer'
import { FileChangeList } from './FileChangeList'
import { CommitDialog } from './CommitDialog'
import { useRelayStore } from '@/store/useRelayStore'
import { X, Check, RotateCcw, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Task } from '@shared/types'
import type { FileChange } from '@/shared/types/review'

/** Extract file list from a unified diff string */
function parseDiffFiles(diffString: string): FileChange[] {
    const files: FileChange[] = []
    const diffHeaders = diffString.match(/^diff --git a\/.+ b\/(.+)$/gm) || []
    const seen = new Set<string>()

    for (const header of diffHeaders) {
        const match = header.match(/^diff --git a\/.+ b\/(.+)$/)
        if (!match || seen.has(match[1])) continue
        seen.add(match[1])

        const filePath = match[1]
        // Determine status from surrounding context
        const idx = diffString.indexOf(header)
        const chunk = diffString.slice(idx, idx + 200)
        let status: FileChange['status'] = 'modified'
        if (chunk.includes('new file mode')) status = 'new'
        else if (chunk.includes('deleted file mode')) status = 'deleted'
        else if (chunk.includes('rename from')) status = 'renamed'

        files.push({ path: filePath, insertions: 0, deletions: 0, status })
    }

    return files
}

interface ReviewPanelProps {
    task: Task
    onClose: () => void
}

export function ReviewPanel({ task, onClose }: ReviewPanelProps) {
    const { activeProject } = useRelayStore()
    const [diffString, setDiffString] = useState('')
    const [files, setFiles] = useState<FileChange[]>([])
    const [loading, setLoading] = useState(true)
    const [showCommitDialog, setShowCommitDialog] = useState(false)
    const [showRejectInput, setShowRejectInput] = useState(false)
    const [rejectionNotes, setRejectionNotes] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [activeFile, setActiveFile] = useState<string | null>(null)
    const diffViewerRef = useRef<DiffViewerHandle>(null)

    useEffect(() => {
        loadDiff()
    }, [task.id]) // eslint-disable-line react-hooks/exhaustive-deps

    const loadDiff = async () => {
        if (!activeProject) return
        setLoading(true)
        try {
            // Auto-pause loop to avoid git lock conflicts (skip in continuous mode — loop keeps running)
            const { loopState: currentLoopState, buildMode } = useRelayStore.getState()
            if (currentLoopState === 'running' && buildMode !== 'continuous') {
                await window.relayAPI.pauseLoop()
                // Brief wait for engine to release git locks
                await new Promise(r => setTimeout(r, 500))
            }

            const diff = await window.relayAPI.reviewGetDiff(activeProject.id, task.id) as string
            setDiffString(diff)
            // Parse file list from the diff itself (works for both WIP commits and working tree diffs)
            setFiles(parseDiffFiles(diff))
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to load diff'
            toast.error('Failed to load diff', { description: msg })
        } finally {
            setLoading(false)
        }
    }

    const handleApprove = async (commitMessage: string) => {
        if (!activeProject) return
        setSubmitting(true)
        try {
            await window.relayAPI.reviewApprove(activeProject.id, task.id, commitMessage)
            setShowCommitDialog(false)
            onClose()
        } catch (err) {
            console.error('Failed to approve:', err)
        } finally {
            setSubmitting(false)
        }
    }

    const handleReject = async () => {
        if (!activeProject || !rejectionNotes.trim()) return
        setSubmitting(true)
        try {
            await window.relayAPI.reviewReject(activeProject.id, task.id, rejectionNotes)
            setShowRejectInput(false)
            setRejectionNotes('')
            onClose()
        } catch (err) {
            console.error('Failed to reject:', err)
        } finally {
            setSubmitting(false)
        }
    }

    const handleFileClick = (path: string) => {
        setActiveFile(path)
        diffViewerRef.current?.scrollToFile(path)
    }

    const defaultCommitMessage = `feat(${task.storyId}): ${task.title}`

    return (
        <div className="fixed inset-0 z-40 flex bg-background/80 backdrop-blur-sm">
            <div className="flex flex-col w-full h-full bg-card border border-border rounded-lg m-4 shadow-xl shadow-black/10 dark:shadow-black/30 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-[var(--color-sidebar)]">
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs font-mono text-muted-foreground shrink-0">{task.storyId}</span>
                        <h2 className="font-semibold text-sm truncate">{task.title}</h2>
                        <span className="text-[11px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400 shrink-0">
                            Review
                        </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {!showRejectInput && (
                            <>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowRejectInput(true)}
                                    disabled={submitting}
                                    className="text-destructive border-destructive/50 hover:bg-destructive/10"
                                >
                                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                                    Reject
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={() => setShowCommitDialog(true)}
                                    disabled={submitting}
                                >
                                    <Check className="h-3.5 w-3.5 mr-1.5" />
                                    Approve & Commit
                                </Button>
                            </>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Reject input bar */}
                {showRejectInput && (
                    <div className="flex items-start gap-3 px-5 py-3 border-b border-border bg-destructive/5">
                        <textarea
                            value={rejectionNotes}
                            onChange={(e) => setRejectionNotes(e.target.value)}
                            placeholder="Describe what needs to change..."
                            className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-background resize-none h-20 focus:outline-none focus:ring-2 focus:ring-ring"
                            autoFocus
                        />
                        <div className="flex flex-col gap-1.5">
                            <Button
                                size="sm"
                                variant="destructive"
                                onClick={handleReject}
                                disabled={!rejectionNotes.trim() || submitting}
                            >
                                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Reject & Retry'}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setShowRejectInput(false)}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                )}

                {/* Content */}
                <div className="flex flex-1 overflow-hidden">
                    {/* File list sidebar */}
                    <div className="w-64 border-r border-border overflow-auto bg-[var(--color-sidebar)]">
                        <div className="px-3 py-2.5 border-b border-border">
                            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Changed Files
                            </h3>
                        </div>
                        <FileChangeList
                            files={files}
                            activeFile={activeFile}
                            onFileClick={handleFileClick}
                        />
                    </div>

                    {/* Diff viewer */}
                    <div className="flex-1 overflow-auto bg-card">
                        {loading ? (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <DiffViewer
                                ref={diffViewerRef}
                                diffString={diffString}
                                onActiveFileChange={setActiveFile}
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* Commit dialog */}
            {showCommitDialog && (
                <CommitDialog
                    defaultMessage={defaultCommitMessage}
                    onConfirm={handleApprove}
                    onCancel={() => setShowCommitDialog(false)}
                />
            )}
        </div>
    )
}
