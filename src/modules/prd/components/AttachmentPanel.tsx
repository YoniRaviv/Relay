import { useCallback, useState } from 'react'
import { Paperclip, ImageIcon, X, FileText } from 'lucide-react'
import type { Attachment } from '@shared/types'

interface AttachmentPanelProps {
    attachments: Attachment[]
    onAdd: (items: Attachment[]) => void
    onRemove: (id: string) => void
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export function AttachmentPanel({ attachments, onAdd, onRemove }: AttachmentPanelProps) {
    const [error, setError] = useState('')

    const handlePick = useCallback(async (mode?: 'all' | 'images' | 'documents') => {
        setError('')
        try {
            const items = await window.relayAPI.pickAttachments(mode)
            if (items.length > 0) onAdd(items)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to read files')
        }
    }, [onAdd])

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setError('')
        setDragging(false)

        const paths: string[] = []
        for (const file of Array.from(e.dataTransfer.files)) {
            if (file.path) paths.push(file.path)
        }
        if (paths.length === 0) return

        try {
            const items = await window.relayAPI.readDroppedFiles(paths)
            if (items.length > 0) onAdd(items)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to read dropped files')
        }
    }, [onAdd])

    const [dragging, setDragging] = useState(false)

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setDragging(true)
    }, [])

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setDragging(false)
    }, [])

    return (
        <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className="space-y-2"
        >
            {/* Drag overlay */}
            {dragging && (
                <div className="rounded-md border-2 border-dashed border-primary/50 bg-primary/5 px-4 py-6 text-center">
                    <p className="text-sm text-primary">Drop files here</p>
                </div>
            )}

            {/* Attachment list */}
            {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {attachments.map((att) => (
                        <div
                            key={att.id}
                            className="flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs group"
                        >
                            {att.type === 'image' ? (
                                <img
                                    src={`data:${att.mediaType};base64,${att.base64}`}
                                    alt={att.name}
                                    className="h-8 w-8 rounded object-cover shrink-0"
                                />
                            ) : (
                                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            )}
                            <span className="text-muted-foreground max-w-[120px] truncate">{att.name}</span>
                            <span className="text-muted-foreground/50">{formatSize(att.size)}</span>
                            <button
                                type="button"
                                onClick={() => onRemove(att.id)}
                                className="ml-0.5 text-muted-foreground/40 hover:text-destructive transition-colors"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-1">
                <button
                    type="button"
                    onClick={() => handlePick('all')}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted/50"
                >
                    <Paperclip className="h-3.5 w-3.5" />
                    Attach
                </button>
                <button
                    type="button"
                    onClick={() => handlePick('images')}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted/50"
                >
                    <ImageIcon className="h-3.5 w-3.5" />
                    Image
                </button>
                {attachments.length > 0 && (
                    <span className="text-[10px] text-muted-foreground/50 ml-auto">
                        {attachments.length}/10
                    </span>
                )}
            </div>

            {error && (
                <p className="text-xs text-destructive">{error}</p>
            )}
        </div>
    )
}
