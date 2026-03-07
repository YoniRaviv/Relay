import { FileText, FilePlus, FileX, FileEdit } from 'lucide-react'

interface FileChange {
  path: string
  insertions: number
  deletions: number
  status: 'new' | 'modified' | 'deleted' | 'renamed'
}

interface FileChangeListProps {
  files: FileChange[]
}

const statusConfig = {
  new: { icon: FilePlus, color: 'text-green-500', label: 'A' },
  modified: { icon: FileEdit, color: 'text-yellow-500', label: 'M' },
  deleted: { icon: FileX, color: 'text-red-500', label: 'D' },
  renamed: { icon: FileText, color: 'text-blue-500', label: 'R' },
}

export function FileChangeList({ files }: FileChangeListProps) {
  if (files.length === 0) {
    return <p className="text-sm text-muted-foreground p-3">No file changes.</p>
  }

  return (
    <div className="space-y-0.5">
      {files.map((file) => {
        const config = statusConfig[file.status]
        const Icon = config.icon
        return (
          <div key={file.path} className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-muted/50 text-sm">
            <Icon className={`h-4 w-4 shrink-0 ${config.color}`} />
            <span className="truncate flex-1 font-mono text-xs">{file.path}</span>
            <span className={`text-xs font-mono font-semibold ${config.color}`}>{config.label}</span>
          </div>
        )
      })}
      <div className="px-3 pt-1 text-xs text-muted-foreground">
        {files.length} file{files.length !== 1 ? 's' : ''} changed
      </div>
    </div>
  )
}
