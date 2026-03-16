import { useMemo, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import { html, parse } from 'diff2html'
import { ChevronDown, ChevronRight, FileEdit, FilePlus, FileX, FileText } from 'lucide-react'
import 'diff2html/bundles/css/diff2html.min.css'

interface DiffViewerProps {
    diffString: string
    outputFormat?: 'side-by-side' | 'line-by-line'
    onActiveFileChange?: (path: string) => void
}

export interface DiffViewerHandle {
    scrollToFile: (path: string) => void
}

const fileTypeConfig = {
    added:   { icon: FilePlus, accent: 'border-l-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/5' },
    deleted: { icon: FileX, accent: 'border-l-rose-500', text: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/5' },
    renamed: { icon: FileText, accent: 'border-l-sky-500', text: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-500/5' },
    changed: { icon: FileEdit, accent: 'border-l-amber-500', text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/5' },
} as const

export const DiffViewer = forwardRef<DiffViewerHandle, DiffViewerProps>(
    function DiffViewer({ diffString, outputFormat = 'line-by-line', onActiveFileChange }, ref) {
        const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

        // Parse diff metadata upfront, but defer HTML generation until file is expanded
        const parsedFiles = useMemo(() => {
            if (!diffString.trim()) return []
            return parse(diffString)
        }, [diffString])

        const fileDiffs = useMemo(() => {
            return parsedFiles.map((file) => ({
                path: file.newName !== '/dev/null' ? file.newName : file.oldName,
                isNew: file.oldName === '/dev/null',
                isDeleted: file.newName === '/dev/null',
                isRenamed: file.isRename,
                addedLines: file.addedLines,
                deletedLines: file.deletedLines,
                isBinary: file.isBinary,
                // Lazy: generate HTML only when needed (cached via htmlCache)
                get html() {
                    const key = `${file.newName}:${outputFormat}`
                    if (!htmlCache.current.has(key)) {
                        htmlCache.current.set(key, html([file], {
                            drawFileList: false,
                            matching: 'lines',
                            outputFormat,
                        }))
                    }
                    return htmlCache.current.get(key)!
                },
            }))
        }, [parsedFiles, outputFormat])

        // Cache generated HTML to avoid re-rendering on collapse/expand
        const htmlCache = useRef(new Map<string, string>())

        const toggleCollapse = useCallback((path: string) => {
            setCollapsed((prev) => ({ ...prev, [path]: !prev[path] }))
        }, [])

        useImperativeHandle(ref, () => ({
            scrollToFile(path: string) {
                const el = document.getElementById(`diff-file-${path}`)
                if (el) {
                    if (collapsed[path]) {
                        setCollapsed((prev) => ({ ...prev, [path]: false }))
                    }
                    onActiveFileChange?.(path)
                    setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
                }
            },
        }), [collapsed, onActiveFileChange])

        if (fileDiffs.length === 0) {
            return <p className="text-muted-foreground p-4 text-sm">No changes detected.</p>
        }

        // Auto-collapse files in large diffs to avoid DOM bloat
        const autoCollapse = fileDiffs.length > 10

        return (
            <div className="diff-viewer">
                {fileDiffs.map((file, index) => {
                    const isCollapsed = collapsed[file.path] ?? (autoCollapse && index > 2)
                    const tag = file.isNew ? 'added' : file.isDeleted ? 'deleted' : file.isRenamed ? 'renamed' : 'changed'
                    const config = fileTypeConfig[tag]
                    const Icon = config.icon

                    return (
                        <div key={file.path} id={`diff-file-${file.path}`}>
                            <button
                                onClick={() => {
                                    toggleCollapse(file.path)
                                    onActiveFileChange?.(file.path)
                                }}
                                className={`flex items-center gap-2.5 w-full px-3 py-2.5 text-left border-l-[3px] transition-colors sticky top-0 z-10 ${config.accent} ${config.bg} hover:brightness-95 dark:hover:brightness-110`}
                            >
                                <Icon className={`h-3.5 w-3.5 shrink-0 ${config.text}`} />
                                <span className="text-xs font-mono font-medium text-foreground truncate flex-1">{file.path}</span>

                                {/* Stats */}
                                <div className="flex items-center gap-2 shrink-0 text-[10px] font-mono tabular-nums">
                                    {file.addedLines > 0 && (
                                        <span className="text-emerald-600 dark:text-emerald-400">+{file.addedLines}</span>
                                    )}
                                    {file.deletedLines > 0 && (
                                        <span className="text-rose-600 dark:text-rose-400">-{file.deletedLines}</span>
                                    )}
                                </div>

                                <span className={`diff-tag diff-tag-${tag}`}>
                                    {tag === 'changed' ? 'Modified' : tag.charAt(0).toUpperCase() + tag.slice(1)}
                                </span>

                                <span className="text-muted-foreground shrink-0">
                                    {isCollapsed
                                        ? <ChevronRight className="h-3.5 w-3.5" />
                                        : <ChevronDown className="h-3.5 w-3.5" />
                                    }
                                </span>
                            </button>

                            {/* Lazy render: only generate HTML when expanded */}
                            {!isCollapsed && (
                                <div
                                    className="text-sm overflow-x-auto"
                                    dangerouslySetInnerHTML={{ __html: file.html }}
                                />
                            )}
                        </div>
                    )
                })}
            </div>
        )
    }
)
