import { FolderSearch, CheckCircle2 } from 'lucide-react'

interface ProjectContextBadgeProps {
    projectContext?: string | null
    scanning?: boolean
}

export function ProjectContextBadge({ projectContext, scanning }: ProjectContextBadgeProps) {
    if (scanning) {
        return (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <FolderSearch className="h-3.5 w-3.5 animate-pulse" />
                <span>Scanning project...</span>
            </div>
        )
    }
    if (projectContext) {
        return (
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Project indexed</span>
            </div>
        )
    }
    return null
}
