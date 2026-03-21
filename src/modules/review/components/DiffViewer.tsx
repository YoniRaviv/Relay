import { useMemo, useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import { parse } from 'diff2html'
import type { DiffFile } from 'diff2html/lib/types'
import { ChevronDown, ChevronRight, FileEdit, FilePlus, FileX, FileText, Columns2, AlignJustify } from 'lucide-react'

interface DiffViewerProps {
    diffString: string
    outputFormat?: 'side-by-side' | 'line-by-line'
    onActiveFileChange?: (path: string) => void
}

export interface DiffViewerHandle {
    scrollToFile: (path: string) => void
}

const fileTypeConfig = {
    added:   { icon: FilePlus, accent: 'border-l-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
    deleted: { icon: FileX, accent: 'border-l-rose-500', text: 'text-rose-600 dark:text-rose-400' },
    renamed: { icon: FileText, accent: 'border-l-sky-500', text: 'text-sky-600 dark:text-sky-400' },
    changed: { icon: FileEdit, accent: 'border-l-amber-500', text: 'text-amber-600 dark:text-amber-400' },
} as const

/* ── Unified diff renderer ── */
function UnifiedDiff({ file }: { file: DiffFile }) {
    return (
        <table className="diff-table w-full border-collapse font-mono text-[13px] leading-[1.55]">
            <tbody>
                {file.blocks.map((block, bi) => (
                    <Fragment key={bi}>
                        {/* Hunk header */}
                        <tr className="diff-hunk">
                            <td className="diff-ln diff-ln-hunk" />
                            <td className="diff-ln diff-ln-hunk" />
                            <td className="diff-hunk-content" colSpan={2}>
                                {block.header}
                            </td>
                        </tr>
                        {block.lines.map((line, li) => {
                            const type = line.type // 'context' | 'insert' | 'delete'
                            const content = line.content.slice(1) // remove leading +/-/space
                            const prefix = line.content[0] === '+' ? '+' : line.content[0] === '-' ? '−' : ' '
                            return (
                                <tr key={`${bi}-${li}`} className={`diff-row diff-row-${type}`}>
                                    <td className={`diff-ln diff-ln-old${type !== 'context' ? ` diff-ln-${type}` : ''}`}>
                                        {line.oldNumber ?? ''}
                                    </td>
                                    <td className={`diff-ln diff-ln-new${type !== 'context' ? ` diff-ln-${type}` : ''}`}>
                                        {line.newNumber ?? ''}
                                    </td>
                                    <td className={`diff-prefix diff-prefix-${type}`}>{prefix}</td>
                                    <td className="diff-content">
                                        <span className="whitespace-pre">{content || '\n'}</span>
                                    </td>
                                </tr>
                            )
                        })}
                    </Fragment>
                ))}
            </tbody>
        </table>
    )
}

/* ── Side-by-side diff renderer ── */
function SideBySideDiff({ file }: { file: DiffFile }) {
    // Build paired rows: for each hunk, pair deletions with insertions
    const rows = useMemo(() => {
        const result: { left: LineData | null; right: LineData | null }[] = []
        for (const block of file.blocks) {
            // Hunk header
            result.push({
                left: { type: 'hunk', content: block.header, lineNo: undefined },
                right: { type: 'hunk', content: '', lineNo: undefined },
            })
            let delBuffer: LineData[] = []
            let insBuffer: LineData[] = []
            const flushBuffers = () => {
                const max = Math.max(delBuffer.length, insBuffer.length)
                for (let i = 0; i < max; i++) {
                    result.push({
                        left: delBuffer[i] ?? null,
                        right: insBuffer[i] ?? null,
                    })
                }
                delBuffer = []
                insBuffer = []
            }
            for (const line of block.lines) {
                if (line.type === 'context') {
                    flushBuffers()
                    const d: LineData = { type: 'context', content: line.content.slice(1), lineNo: line.oldNumber }
                    const d2: LineData = { type: 'context', content: line.content.slice(1), lineNo: line.newNumber }
                    result.push({ left: d, right: d2 })
                } else if (line.type === 'delete') {
                    delBuffer.push({ type: 'delete', content: line.content.slice(1), lineNo: line.oldNumber })
                } else if (line.type === 'insert') {
                    insBuffer.push({ type: 'insert', content: line.content.slice(1), lineNo: line.newNumber })
                }
            }
            flushBuffers()
        }
        return result
    }, [file.blocks])

    return (
        <table className="diff-table w-full border-collapse font-mono text-[13px] leading-[1.55]">
            <tbody>
                {rows.map((row, i) => {
                    const lType = row.left?.type ?? 'empty'
                    const rType = row.right?.type ?? 'empty'
                    return (
                        <tr key={i}>
                            {/* ── Left side ── */}
                            {lType === 'hunk' ? (
                                <>
                                    <td className="diff-ln diff-ln-hunk" />
                                    <td className="diff-hunk-content" colSpan={2}>{row.left!.content}</td>
                                </>
                            ) : lType === 'empty' ? (
                                <>
                                    <td className="diff-ln diff-side-empty" />
                                    <td className="diff-side-empty" colSpan={2}>&nbsp;</td>
                                </>
                            ) : (
                                <>
                                    <td className={`diff-ln diff-ln-${lType}`}>{row.left!.lineNo ?? ''}</td>
                                    <td className={`diff-prefix diff-prefix-${lType}`}>{lType === 'delete' ? '−' : ' '}</td>
                                    <td className={`diff-content diff-content-sbs diff-content-sbs-${lType}`}>
                                        <span className="whitespace-pre">{row.left!.content || '\n'}</span>
                                    </td>
                                </>
                            )}
                            {/* ── Right side ── */}
                            {rType === 'hunk' ? (
                                <>
                                    <td className="diff-ln diff-ln-hunk" />
                                    <td className="diff-hunk-content" colSpan={2} />
                                </>
                            ) : rType === 'empty' ? (
                                <>
                                    <td className="diff-ln diff-side-empty" />
                                    <td className="diff-side-empty" colSpan={2}>&nbsp;</td>
                                </>
                            ) : (
                                <>
                                    <td className={`diff-ln diff-ln-${rType}`}>{row.right!.lineNo ?? ''}</td>
                                    <td className={`diff-prefix diff-prefix-${rType}`}>{rType === 'insert' ? '+' : ' '}</td>
                                    <td className={`diff-content diff-content-sbs diff-content-sbs-${rType}`}>
                                        <span className="whitespace-pre">{row.right!.content || '\n'}</span>
                                    </td>
                                </>
                            )}
                        </tr>
                    )
                })}
            </tbody>
        </table>
    )
}

interface LineData {
    type: 'context' | 'insert' | 'delete' | 'hunk'
    content: string
    lineNo: number | undefined
}

import { Fragment } from 'react'

export const DiffViewer = forwardRef<DiffViewerHandle, DiffViewerProps>(
    function DiffViewer({ diffString, outputFormat: initialFormat = 'line-by-line', onActiveFileChange }, ref) {
        const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
        const [outputFormat, setOutputFormat] = useState(initialFormat)

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
                file,
            }))
        }, [parsedFiles])

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

        const autoCollapse = fileDiffs.length > 10

        return (
            <div className="diff-viewer bg-[var(--color-background)] min-h-full">
                {/* Format toggle */}
                <div className="flex items-center gap-1 px-4 py-2 bg-[var(--color-secondary)]">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mr-2">View</span>
                    <button
                        onClick={() => setOutputFormat('line-by-line')}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                            outputFormat === 'line-by-line'
                                ? 'bg-primary/10 text-primary'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                    >
                        <AlignJustify className="h-3 w-3" />
                        Unified
                    </button>
                    <button
                        onClick={() => setOutputFormat('side-by-side')}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                            outputFormat === 'side-by-side'
                                ? 'bg-primary/10 text-primary'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                    >
                        <Columns2 className="h-3 w-3" />
                        Side by Side
                    </button>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                        {fileDiffs.length} file{fileDiffs.length !== 1 ? 's' : ''} changed
                    </span>
                </div>
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
                                className={`flex items-center gap-2.5 w-full px-4 py-2.5 text-left border-l-[3px] transition-colors sticky top-0 z-10 bg-[var(--color-secondary)] ${config.accent} hover:brightness-95 dark:hover:brightness-110`}
                            >
                                <Icon className={`h-3.5 w-3.5 shrink-0 ${config.text}`} />
                                <span className="text-xs font-mono font-medium text-foreground truncate flex-1">{file.path}</span>

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

                            {!isCollapsed && (
                                <div className="overflow-x-auto">
                                    {outputFormat === 'line-by-line'
                                        ? <UnifiedDiff file={file.file} />
                                        : <SideBySideDiff file={file.file} />
                                    }
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        )
    }
)
