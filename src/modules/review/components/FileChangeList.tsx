import { FilePlus, FileX, FileEdit, FileText } from 'lucide-react'
import type { FileChange } from '@/shared/types/review'

interface FileChangeListProps {
    files: FileChange[]
    activeFile?: string | null
    onFileClick?: (path: string) => void
}

const statusConfig = {
    new: { icon: FilePlus, accent: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', label: 'A' },
    modified: { icon: FileEdit, accent: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', label: 'M' },
    deleted: { icon: FileX, accent: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400', label: 'D' },
    renamed: { icon: FileText, accent: 'bg-sky-500', text: 'text-sky-600 dark:text-sky-400', label: 'R' },
}

function fileName(path: string): string {
    return path.split('/').pop() || path
}

function dirPath(path: string): string {
    const parts = path.split('/')
    return parts.length > 1 ? parts.slice(0, -1).join('/') + '/' : ''
}

export function FileChangeList({ files, activeFile, onFileClick }: FileChangeListProps) {
    if (files.length === 0) {
        return <p className="text-sm text-muted-foreground p-3">No file changes.</p>
    }

    return (
        <div className="py-1">
            {files.map((file) => {
                const config = statusConfig[file.status]
                const Icon = config.icon
                const isActive = activeFile === file.path
                const hasStats = file.insertions > 0 || file.deletions > 0

                return (
                    <button
                        key={file.path}
                        onClick={() => onFileClick?.(file.path)}
                        className={`flex items-center gap-2 px-3 py-2 w-full text-left transition-colors relative ${
                            isActive
                                ? 'bg-accent/80'
                                : 'hover:bg-accent/40'
                        }`}
                    >
                        {/* Left accent bar */}
                        <div className={`absolute left-0 top-1 bottom-1 w-[3px] rounded-r ${isActive ? config.accent : 'bg-transparent'}`} />

                        <Icon className={`h-3.5 w-3.5 shrink-0 ${config.text}`} />

                        <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-1">
                                <span className="truncate text-xs font-medium text-foreground">{fileName(file.path)}</span>
                                <span className={`text-[10px] font-mono font-semibold ${config.text}`}>{config.label}</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground truncate block">{dirPath(file.path)}</span>
                        </div>

                        {hasStats && (
                            <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-mono tabular-nums">
                                {file.insertions > 0 && (
                                    <span className="text-emerald-600 dark:text-emerald-400">+{file.insertions}</span>
                                )}
                                {file.deletions > 0 && (
                                    <span className="text-rose-600 dark:text-rose-400">-{file.deletions}</span>
                                )}
                            </div>
                        )}
                    </button>
                )
            })}
            <div className="px-3 pt-2 pb-1 text-[10px] text-muted-foreground uppercase tracking-wider">
                {files.length} file{files.length !== 1 ? 's' : ''} changed
            </div>
        </div>
    )
}
