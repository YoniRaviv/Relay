import { Play, Pencil, Trash2, ListOrdered } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Playbook } from '@/shared/types/scheduler'

interface PlaybookCardProps {
    playbook: Playbook
    onRun: () => void
    onEdit: () => void
    onDelete: () => void
}

export function PlaybookCard({ playbook, onRun, onEdit, onDelete }: PlaybookCardProps) {
    const stepCount = playbook.steps?.length ?? 0
    return (
        <div className="shrink-0 w-64 p-3 rounded-lg bg-card border border-border/40 shadow-sm">
            <div className="flex items-center gap-2">
                <p className="text-sm font-medium leading-tight truncate">{playbook.name}</p>
                {stepCount > 1 && (
                    <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400">
                        <ListOrdered className="h-2.5 w-2.5" />
                        {stepCount} steps
                    </span>
                )}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2 min-h-[2em]">
                {playbook.prompt || playbook.steps?.map((s) => s.name).join(' → ') || ''}
            </p>
            <div className="mt-2 flex items-center gap-1">
                <Button size="sm" className="h-7 text-[12px]" onClick={onRun}>
                    <Play className="h-3 w-3 mr-1" />
                    Run
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 ml-auto" onClick={onEdit}>
                    <Pencil className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={onDelete}>
                    <Trash2 className="h-3 w-3" />
                </Button>
            </div>
        </div>
    )
}
