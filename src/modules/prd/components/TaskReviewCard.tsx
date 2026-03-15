import { Trash2, Pencil } from 'lucide-react'
import { priorityTextColors } from '@/shared/constants/statusMaps'
import type { DecomposedTask } from '@/shared/types/prd'

export function TaskReviewCard({
    task,
    onEdit,
    onRemove,
}: {
    task: DecomposedTask
    onEdit: () => void
    onRemove: () => void
}) {
    return (
        <div
            className="group p-3 rounded-lg bg-card hover:shadow-sm transition-all cursor-pointer"
            onClick={onEdit}
        >
            <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-mono text-muted-foreground">{task.storyId}</span>
                <span className={`text-[11px] font-medium uppercase tracking-wide ${priorityTextColors[task.priority]}`}>
                    {task.priority}
                </span>
                <div className="ml-auto flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={(e) => { e.stopPropagation(); onEdit() }}
                        className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
                    >
                        <Pencil className="h-3 w-3" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onRemove() }}
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    >
                        <Trash2 className="h-3 w-3" />
                    </button>
                </div>
            </div>
            <p className="text-sm font-medium leading-tight">{task.title}</p>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{task.description}</p>
        </div>
    )
}
