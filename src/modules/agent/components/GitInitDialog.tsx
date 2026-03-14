import { Button } from '@/components/ui/button'
import { GitBranch, AlertTriangle } from 'lucide-react'

interface GitInitDialogProps {
    onConfirm: () => void
    onCancel: () => void
}

export function GitInitDialog({ onConfirm, onCancel }: GitInitDialogProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm mx-4">
                <div className="p-5 space-y-4">
                    <div className="flex items-start gap-3">
                        <div className="rounded-full bg-amber-500/10 p-2 shrink-0">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-sm">No Git Repository</h3>
                            <p className="text-xs text-muted-foreground mt-1">
                                This project doesn't have a git repository. Initialize one to track changes made by the build loop?
                            </p>
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
                    <Button variant="outline" size="sm" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button size="sm" onClick={onConfirm} className="gap-1.5">
                        <GitBranch className="h-3.5 w-3.5" />
                        Initialize Git
                    </Button>
                </div>
            </div>
        </div>
    )
}
