import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'

interface FeatureInputProps {
    value: string
    onChange: (value: string) => void
    onSubmit: () => void
    loading: boolean
}

export function FeatureInput({ value, onChange, onSubmit, loading }: FeatureInputProps) {
    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="feature">Describe the feature you want to build</Label>
                <textarea
                    id="feature"
                    className="flex min-h-[200px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                    placeholder="Describe the feature in detail. What should it do? Who is it for? What problem does it solve?"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                />
            </div>
            <Button onClick={onSubmit} disabled={!value.trim() || loading} className="w-full">
                {loading ? (
                    <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Generating PRD...
                    </>
                ) : (
                    'Generate PRD'
                )}
            </Button>
        </div>
    )
}
