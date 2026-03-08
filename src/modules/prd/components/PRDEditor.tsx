import { Button } from '@/components/ui/button'

interface PRDEditorProps {
    markdown: string
    onChange: (value: string) => void
    onSave: () => void
}

export function PRDEditor({ markdown, onChange, onSave }: PRDEditorProps) {
    return (
        <div className="space-y-6">
            <textarea
                className="flex min-h-[60vh] w-full rounded-md border border-input bg-transparent px-4 py-3 text-sm shadow-sm font-mono leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                value={markdown}
                onChange={(e) => onChange(e.target.value)}
            />
            <Button onClick={onSave} className="w-full">
                Save & Continue
            </Button>
        </div>
    )
}
