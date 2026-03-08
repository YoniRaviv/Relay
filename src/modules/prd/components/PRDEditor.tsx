import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

interface PRDEditorProps {
    markdown: string
    onChange: (value: string) => void
    onSave: () => void
}

export function PRDEditor({ markdown, onChange, onSave }: PRDEditorProps) {
    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label>Edit PRD</Label>
                <textarea
                    className="flex min-h-[400px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                    value={markdown}
                    onChange={(e) => onChange(e.target.value)}
                />
            </div>
            <Button onClick={onSave} className="w-full">
                Save & Continue
            </Button>
        </div>
    )
}
