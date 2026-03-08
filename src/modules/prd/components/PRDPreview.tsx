import { Button } from '@/components/ui/button'
import { StreamingText } from '@/shared/components/StreamingText'

interface PRDPreviewProps {
    markdown: string
    streaming: boolean
    agentStatus?: string
    onEdit: () => void
    onApprove: () => void
}

export function PRDPreview({ markdown, streaming, agentStatus, onEdit, onApprove }: PRDPreviewProps) {
    return (
        <div className="space-y-4">
            {streaming && agentStatus && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span>{agentStatus}</span>
                </div>
            )}
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
