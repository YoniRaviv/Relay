import { useState } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ApprovalActionsProps {
    jobId: string
    onResolved: () => Promise<void> | void
}

/** Approve / edit-and-approve / reject a needs_approval job. Parent refreshes via onResolved. */
export function ApprovalActions({ jobId, onResolved }: ApprovalActionsProps) {
    const [editing, setEditing] = useState(false)
    const [amended, setAmended] = useState('')
    const [busy, setBusy] = useState(false)

    const run = async (fn: () => Promise<unknown>) => {
        setBusy(true)
        try {
            await fn()
            await onResolved()
        } finally {
            setBusy(false)
        }
    }

    if (editing) {
        return (
            <div className="space-y-2">
                <textarea
                    value={amended}
                    onChange={(e) => setAmended(e.target.value)}
                    placeholder="Amended proposal — what should be done instead?"
                    className="w-full h-24 px-3 py-2 text-sm rounded-md border border-border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    autoFocus
                />
                <div className="flex gap-2">
                    <Button
                        size="sm"
                        disabled={busy || !amended.trim()}
                        onClick={() => run(() => window.relayAPI.scheduler.edit(jobId, amended.trim()))}
                    >
                        <Check className="h-3.5 w-3.5 mr-1.5" />
                        Send & Approve
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(false)}>
                        Cancel
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="flex items-center gap-2">
            <Button size="sm" disabled={busy} onClick={() => run(() => window.relayAPI.scheduler.approve(jobId))}>
                <Check className="h-3.5 w-3.5 mr-1.5" />
                Approve
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit & Approve
            </Button>
            <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => run(() => window.relayAPI.scheduler.reject(jobId))}
            >
                <X className="h-3.5 w-3.5 mr-1.5" />
                Reject
            </Button>
        </div>
    )
}
