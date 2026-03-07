import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { DiffViewer } from '@/components/DiffViewer'
import { FileChangeList } from '@/components/FileChangeList'
import { CommitDialog } from '@/components/CommitDialog'
import { useRelayStore } from '@/store/useRelayStore'
import { X, Check, RotateCcw, Loader2 } from 'lucide-react'
import type { Task } from '@shared/types'

interface FileChange {
  path: string
  insertions: number
  deletions: number
  status: 'new' | 'modified' | 'deleted' | 'renamed'
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

  useEffect(() => {
    loadDiff()
  }, [task.id])

  const loadDiff = async () => {
    if (!activeProject) return
    setLoading(true)
    try {
      const [diff, status] = await Promise.all([
        window.relayAPI.reviewGetDiff(activeProject.id),
        window.relayAPI.gitStatus(activeProject.id),
      ])
      setDiffString(diff as string)
      setFiles((status as { files: FileChange[] }).files)
    } catch (err) {
      console.error('Failed to load diff:', err)
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

  const defaultCommitMessage = `feat(${task.storyId}): ${task.title}`

  return (
    <div className="fixed inset-0 z-40 flex bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col w-full h-full bg-card border border-border rounded-lg m-4 shadow-xl overflow-hidden">
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
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
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
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Changed Files
              </h3>
            </div>
            <FileChangeList files={files} />
          </div>

          {/* Diff viewer */}
          <div className="flex-1 overflow-auto bg-card">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <DiffViewer diffString={diffString} />
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
