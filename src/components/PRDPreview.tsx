import { Button } from '@/components/ui/button'
import { StreamingText } from '@/components/StreamingText'

interface PRDPreviewProps {
  markdown: string
  streaming: boolean
  onEdit: () => void
  onApprove: () => void
}

export function PRDPreview({ markdown, streaming, onEdit, onApprove }: PRDPreviewProps) {
  return (
    <div className="space-y-4">
      <div className="border rounded-md p-4 max-h-[400px] overflow-auto bg-muted/30">
        {streaming ? (
          <StreamingText text={markdown} />
        ) : (
          <div className="whitespace-pre-wrap font-mono text-sm">{markdown}</div>
        )}
      </div>
      {!streaming && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={onEdit} className="flex-1">
            Edit PRD
          </Button>
          <Button onClick={onApprove} className="flex-1">
            Approve & Decompose
          </Button>
        </div>
      )}
    </div>
  )
}
