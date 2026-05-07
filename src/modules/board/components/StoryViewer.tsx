import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRelayStore } from '@/store/useRelayStore'

export function StoryViewer() {
    const viewingStory = useRelayStore((s) => s.viewingStory)
    const setViewingStory = useRelayStore((s) => s.setViewingStory)
    const activeProject = useRelayStore((s) => s.activeProject)
    const [markdown, setMarkdown] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!viewingStory || !activeProject) return
        let cancelled = false
        setLoading(true)
        setMarkdown(null)
        window.relayAPI
            .listPrds(activeProject.id)
            .then((prds) => {
                if (cancelled) return
                const match = (prds as Array<{ id: string; markdown: string }>).find(
                    (p) => p.id === viewingStory.prdId,
                )
                setMarkdown(match?.markdown ?? '')
            })
            .catch(() => {
                if (!cancelled) setMarkdown('')
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [viewingStory, activeProject])

    useEffect(() => {
        if (!viewingStory) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setViewingStory(null)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [viewingStory, setViewingStory])

    const { matchedSection, restSnippet } = useMemo(() => {
        if (!markdown || !viewingStory) return { matchedSection: null, restSnippet: null }
        const storyId = viewingStory.storyId
        const lines = markdown.split('\n')
        let startIdx = -1
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(storyId)) {
                startIdx = i
                break
            }
        }
        if (startIdx === -1) return { matchedSection: null, restSnippet: null }

        let endIdx = lines.length
        for (let i = startIdx + 1; i < lines.length; i++) {
            const line = lines[i].trim()
            if (/^#{1,3}\s/.test(line) || /^\d+\.\s+\*\*US-/.test(line) || /^- \*\*US-/.test(line)) {
                endIdx = i
                break
            }
        }
        return {
            matchedSection: lines.slice(startIdx, endIdx).join('\n').trim(),
            restSnippet: lines.slice(0, Math.min(startIdx, 6)).join('\n').trim(),
        }
    }, [markdown, viewingStory])

    useEffect(() => {
        if (!matchedSection || !containerRef.current) return
        containerRef.current.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    }, [matchedSection])

    if (!viewingStory) return null

    return (
        <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm"
            onClick={() => setViewingStory(null)}
        >
            <div
                className="relative w-[640px] max-w-[92vw] max-h-[80vh] flex flex-col rounded-lg border border-border bg-card shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground">{viewingStory.storyId}</span>
                        <span className="text-sm font-semibold">User Story</span>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setViewingStory(null)}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
                <div ref={containerRef} className="flex-1 overflow-auto px-5 py-4">
                    {loading ? (
                        <p className="text-sm text-muted-foreground">Loading specification...</p>
                    ) : matchedSection ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{matchedSection}</ReactMarkdown>
                        </div>
                    ) : markdown ? (
                        <div className="space-y-3">
                            <p className="text-xs text-muted-foreground italic">
                                Couldn't find {viewingStory.storyId} in this PRD. Showing intro:
                            </p>
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{restSnippet ?? ''}</ReactMarkdown>
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground italic">
                            No specification document available for this task.
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}
