import { Plus } from 'lucide-react'

interface AddTaskButtonProps {
    onClick: () => void
}

export function AddTaskButton({ onClick }: AddTaskButtonProps) {
    return (
        <button
            onClick={onClick}
            className="w-full py-2 rounded-lg border border-dashed border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors flex items-center justify-center gap-1.5"
        >
            <Plus className="h-3 w-3" />
            Add Task
        </button>
    )
}
