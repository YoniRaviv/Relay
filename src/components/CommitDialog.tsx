import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { X, GitCommit } from 'lucide-react'

interface CommitDialogProps {
  defaultMessage: string
  onConfirm: (message: string) => void
  onCancel: () => void
}

export function CommitDialog({ defaultMessage, onConfirm, onCancel }: CommitDialogProps) {
  const [message, setMessage] = useState(defaultMessage)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border rounded-lg shadow-lg w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <GitCommit className="h-4 w-4" />
            <h3 className="font-semibold text-sm">Commit Changes</h3>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 space-y-3">
          <label className="text-xs font-medium text-muted-foreground">Commit message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full h-24 px-3 py-2 text-sm rounded-md border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            autoFocus
          />
        </div>

        <div className="flex justify-end gap-2 p-4 border-t">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onConfirm(message)} disabled={!message.trim()}>
            <GitCommit className="h-3.5 w-3.5 mr-1.5" />
            Commit
          </Button>
        </div>
      </div>
    </div>
  )
}
