import { useRef, useEffect, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Sparkles, Loader2, PenLine, ArrowRight, Check, MessageSquare } from 'lucide-react'
import { FileAutocomplete } from './FileAutocomplete'
import type { BrainstormMessage, BrainstormQuestion, BrainstormApproaches, BrainstormDesignSection, BrainstormReady } from '@shared/types'

interface BrainstormChatProps {
    messages: BrainstormMessage[]
    streaming: boolean
    finalizing: boolean
    onSend: (message: string) => void
    onFinalize: () => void
    projectId?: string | null
}

// ── Phase labels ──

type PhaseType = 'questions' | 'approaches' | 'design' | 'ready'

function getPhaseForBlock(type: string): PhaseType {
    if (type === 'question') return 'questions'
    if (type === 'approaches') return 'approaches'
    if (type === 'design-section') return 'design'
    return 'ready'
}

const PHASE_LABELS: Record<PhaseType, string> = {
    questions: 'Understanding your needs',
    approaches: 'Exploring approaches',
    design: 'Designing the solution',
    ready: 'Design complete',
}

function PhaseHeading({ phase }: { phase: PhaseType }) {
    return (
        <div className="flex items-center gap-2 pt-2 pb-1">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-1">
                {PHASE_LABELS[phase]}
            </span>
            <div className="h-px flex-1 bg-border" />
        </div>
    )
}

// ── Tradeoffs parser ──

function parseTradeoffs(tradeoffs: string): { pros: string[]; cons: string[] } {
    const pros: string[] = []
    const cons: string[] = []

    // Try to split "Pros: ... Cons: ..." pattern
    const prosMatch = tradeoffs.match(/Pros?:\s*(.*?)(?=\s*Cons?:|$)/is)
    const consMatch = tradeoffs.match(/Cons?:\s*(.*?)$/is)

    if (prosMatch) {
        prosMatch[1].split(/[,;.]/).map(s => s.trim()).filter(Boolean).forEach(s => pros.push(s))
    }
    if (consMatch) {
        consMatch[1].split(/[,;.]/).map(s => s.trim()).filter(Boolean).forEach(s => cons.push(s))
    }

    // Fallback: if no pattern matched, put everything as-is
    if (pros.length === 0 && cons.length === 0) {
        pros.push(tradeoffs)
    }

    return { pros, cons }
}

// ── History renderers (collapsed past turns) ──

function HistoryQuestion({ block, answer }: { block: BrainstormQuestion; answer: string }) {
    return (
        <div className="rounded-lg border border-border bg-card/50 px-4 py-2.5 space-y-1">
            <p className="text-xs text-muted-foreground">{block.question}</p>
            <p className="text-sm text-foreground font-medium flex items-center gap-1.5">
                <Check className="h-3 w-3 text-primary shrink-0" />
                {answer}
            </p>
        </div>
    )
}

function HistoryApproaches({ block, answer }: { block: BrainstormApproaches; answer: string }) {
    const chosen = block.approaches.find(a => answer.includes(a.title))?.title || answer
    return (
        <div className="rounded-lg border border-border bg-card/50 px-4 py-2.5 space-y-1">
            <p className="text-xs text-muted-foreground">Approach selection</p>
            <p className="text-sm text-foreground font-medium flex items-center gap-1.5">
                <Check className="h-3 w-3 text-primary shrink-0" />
                {chosen}
            </p>
        </div>
    )
}

function HistoryDesignSection({ block, answer }: { block: BrainstormDesignSection; answer: string }) {
    const approved = answer.toLowerCase().includes('looks good') || answer.toLowerCase().includes('approved') || answer.toLowerCase().includes('continue')
    return (
        <div className="rounded-lg border border-border bg-card/50 px-4 py-2.5 space-y-1">
            <p className="text-xs text-muted-foreground">{block.title}</p>
            <p className="text-sm text-foreground font-medium flex items-center gap-1.5">
                {approved ? (
                    <><Check className="h-3 w-3 text-primary shrink-0" />Approved</>
                ) : (
                    <><MessageSquare className="h-3 w-3 text-muted-foreground shrink-0" />Revised</>
                )}
            </p>
        </div>
    )
}

function HistoryFallback({ content }: { content: string }) {
    return (
        <div className="rounded-lg border border-border bg-card/50 px-4 py-2.5">
            <p className="text-sm text-foreground/80 line-clamp-2">{content}</p>
        </div>
    )
}

// ── Active block renderers (current interactive element) ──

function ActiveQuestionBlock({ block, onSubmit, projectId }: {
    block: BrainstormQuestion
    onSubmit: (answer: string) => void
    projectId?: string | null
}) {
    const [selected, setSelected] = useState('')
    const [showCustom, setShowCustom] = useState(false)
    const [customText, setCustomText] = useState('')
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [showAutocomplete, setShowAutocomplete] = useState(false)
    const [autocompleteQuery, setAutocompleteQuery] = useState('')
    const [atStartIndex, setAtStartIndex] = useState(-1)

    const handleSubmit = () => {
        const answer = showCustom ? customText.trim() : selected
        if (answer) onSubmit(answer)
    }

    const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value
        setCustomText(newValue)

        const cursorPos = e.target.selectionStart
        const textBeforeCursor = newValue.substring(0, cursorPos)
        const atMatch = textBeforeCursor.match(/@([^\s@]*)$/)
        if (atMatch) {
            setAtStartIndex(textBeforeCursor.lastIndexOf('@'))
            setAutocompleteQuery(atMatch[1])
            setShowAutocomplete(true)
        } else {
            setShowAutocomplete(false)
        }
    }, [])

    const handleFileTagSelect = useCallback((filePath: string) => {
        if (atStartIndex < 0) return
        const before = customText.substring(0, atStartIndex)
        const after = customText.substring(atStartIndex + 1 + autocompleteQuery.length)
        setCustomText(`${before}@${filePath} ${after}`)
        setShowAutocomplete(false)
        setAtStartIndex(-1)
        setTimeout(() => textareaRef.current?.focus(), 0)
    }, [customText, atStartIndex, autocompleteQuery])

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && customText.trim()) {
            e.preventDefault()
            handleSubmit()
        }
    }

    return (
        <div className="space-y-5">
            <h3 className="text-base font-medium text-foreground leading-snug">
                {block.question}
            </h3>

            {/* Option cards */}
            {block.options && block.options.length > 0 && !showCustom && (
                <div className="space-y-2">
                    {block.options.map((opt) => {
                        const isSelected = selected === opt
                        return (
                            <button
                                key={opt}
                                type="button"
                                onClick={() => setSelected(isSelected ? '' : opt)}
                                className={`w-full text-left px-4 py-3 rounded-lg border transition-all text-sm leading-relaxed ${
                                    isSelected
                                        ? 'border-primary bg-primary/8 text-foreground ring-1 ring-primary/30'
                                        : 'border-border bg-card text-foreground/80 hover:border-primary/40 hover:bg-card/80'
                                }`}
                            >
                                <div className="flex items-start gap-3">
                                    <div className={`mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                                        isSelected
                                            ? 'border-primary bg-primary'
                                            : 'border-muted-foreground/40'
                                    }`}>
                                        {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                                    </div>
                                    <span>{opt}</span>
                                </div>
                            </button>
                        )
                    })}
                </div>
            )}

            {/* Custom answer toggle */}
            {block.options && block.options.length > 0 && !showCustom && (
                <button
                    type="button"
                    onClick={() => { setShowCustom(true); setSelected('') }}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                    <PenLine className="h-3 w-3" />
                    Type a custom answer instead
                </button>
            )}

            {/* Custom answer textarea */}
            {(!block.options || block.options.length === 0 || showCustom) && (
                <div className="relative">
                    <textarea
                        ref={textareaRef}
                        className="flex min-h-[80px] w-full rounded-lg border border-input bg-card px-4 py-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring resize-none"
                        placeholder="Type your answer... (@ to reference files)"
                        value={customText}
                        onChange={handleTextChange}
                        onKeyDown={handleKeyDown}
                        autoFocus
                    />
                    {showAutocomplete && projectId && (
                        <FileAutocomplete
                            query={autocompleteQuery}
                            projectId={projectId}
                            onSelect={handleFileTagSelect}
                            onDismiss={() => setShowAutocomplete(false)}
                        />
                    )}
                    {showCustom && block.options && block.options.length > 0 && (
                        <button
                            type="button"
                            onClick={() => { setShowCustom(false); setCustomText('') }}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
                        >
                            Back to options
                        </button>
                    )}
                </div>
            )}

            <div className="flex justify-end">
                <Button
                    onClick={handleSubmit}
                    disabled={showCustom ? !customText.trim() : !selected}
                    className="gap-1.5"
                >
                    Next
                    <ArrowRight className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    )
}

function ActiveApproachesBlock({ block, onSubmit }: {
    block: BrainstormApproaches
    onSubmit: (answer: string) => void
}) {
    const [selected, setSelected] = useState('')

    return (
        <div className="space-y-5">
            <p className="text-sm text-foreground/80 leading-relaxed">{block.summary}</p>

            <div className="grid gap-3">
                {block.approaches.map((approach) => {
                    const isSelected = selected === approach.title
                    const isRecommended = approach.title === block.recommendation
                    const { pros, cons } = parseTradeoffs(approach.tradeoffs)
                    return (
                        <button
                            key={approach.title}
                            type="button"
                            onClick={() => setSelected(isSelected ? '' : approach.title)}
                            className={`text-left p-4 rounded-lg border transition-all ${
                                isSelected
                                    ? 'border-primary bg-primary/8 ring-1 ring-primary/30'
                                    : 'border-border bg-card hover:border-primary/40'
                            }`}
                        >
                            <div className="flex items-start gap-3">
                                <div className={`mt-1 h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                                    isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                                }`}>
                                    {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="text-sm font-semibold text-foreground">{approach.title}</h4>
                                        {isRecommended && (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                                                <Sparkles className="h-2.5 w-2.5" />
                                                Recommended
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-foreground/80 mb-2">{approach.description}</p>
                                    <div className="space-y-1">
                                        {pros.length > 0 && (
                                            <p className="text-xs">
                                                <span className="font-medium text-emerald-500">Pros: </span>
                                                <span className="text-muted-foreground">{pros.join(', ')}</span>
                                            </p>
                                        )}
                                        {cons.length > 0 && (
                                            <p className="text-xs">
                                                <span className="font-medium text-red-400">Cons: </span>
                                                <span className="text-muted-foreground">{cons.join(', ')}</span>
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </button>
                    )
                })}
            </div>

            <div className="flex justify-end">
                <Button
                    onClick={() => onSubmit(`I'd like to go with: ${selected}`)}
                    disabled={!selected}
                    className="gap-1.5"
                >
                    Choose this approach
                    <ArrowRight className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    )
}

function ActiveDesignSectionBlock({ block, onSubmit }: {
    block: BrainstormDesignSection
    onSubmit: (answer: string) => void
}) {
    const [revising, setRevising] = useState(false)
    const [notes, setNotes] = useState('')

    return (
        <div className="space-y-5">
            <div className="rounded-lg border border-border bg-card p-5">
                <div className="prose prose-sm prose-tight dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {block.content}
                    </ReactMarkdown>
                </div>
            </div>

            {revising ? (
                <div className="space-y-3">
                    <textarea
                        className="flex min-h-[80px] w-full rounded-lg border border-input bg-card px-4 py-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring resize-none"
                        placeholder="What should be changed?"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        autoFocus
                    />
                    <div className="flex gap-2 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => { setRevising(false); setNotes('') }}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => onSubmit(`Please revise "${block.title}": ${notes}`)}
                            disabled={!notes.trim()}
                        >
                            Send feedback
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setRevising(true)}>
                        Request changes
                    </Button>
                    <Button onClick={() => onSubmit('Looks good, continue')} className="gap-1.5">
                        <Check className="h-3.5 w-3.5" />
                        Approve
                    </Button>
                </div>
            )}
        </div>
    )
}

function ActiveReadyBlock({ block, onFinalize }: {
    block: BrainstormReady
    onFinalize: () => void
}) {
    return (
        <div className="space-y-5">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-5">
                <div className="flex items-start gap-3">
                    <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div>
                        <h4 className="text-sm font-semibold text-foreground mb-1">Design complete</h4>
                        <p className="text-sm text-foreground/80 leading-relaxed">{block.summary}</p>
                    </div>
                </div>
            </div>
            <div className="flex justify-end">
                <Button onClick={onFinalize} className="gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    Finalize Design
                </Button>
            </div>
        </div>
    )
}

function QuestionSkeleton() {
    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <div className="h-5 w-4/5 bg-muted rounded animate-pulse" />
                <div className="h-5 w-2/5 bg-muted/70 rounded animate-pulse" />
            </div>
            <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border/40 bg-card/30" style={{ opacity: 1 - i * 0.15 }}>
                        <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/20 shrink-0" />
                        <div className="h-4 rounded bg-muted/50 animate-pulse" style={{ width: `${75 - i * 12}%`, animationDelay: `${i * 150}ms` }} />
                    </div>
                ))}
            </div>
            <ThinkingIndicator />
        </div>
    )
}

function ApproachesSkeleton() {
    return (
        <div className="space-y-5">
            <div className="h-4 w-3/4 bg-muted/70 rounded animate-pulse" />
            <div className="grid gap-3">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="p-4 rounded-lg border border-border/40 bg-card/30" style={{ opacity: 1 - i * 0.1 }}>
                        <div className="flex items-start gap-3">
                            <div className="mt-1 h-4 w-4 rounded-full border-2 border-muted-foreground/20 shrink-0" />
                            <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="h-4 w-32 bg-muted rounded animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
                                    {i === 1 && <div className="h-4 w-20 bg-primary/10 rounded animate-pulse" />}
                                </div>
                                <div className="h-3 w-full bg-muted/50 rounded animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
                                <div className="h-3 w-4/5 bg-muted/40 rounded animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
                                <div className="space-y-1 pt-1">
                                    <div className="h-3 w-3/5 bg-muted/30 rounded animate-pulse" />
                                    <div className="h-3 w-2/5 bg-muted/30 rounded animate-pulse" />
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <ThinkingIndicator />
        </div>
    )
}

function DesignSectionSkeleton() {
    return (
        <div className="space-y-5">
            <div className="rounded-lg border border-border/40 bg-card/30 p-5 space-y-3">
                <div className="h-4 w-40 bg-muted rounded animate-pulse" />
                <div className="space-y-2">
                    <div className="h-3 w-full bg-muted/50 rounded animate-pulse" />
                    <div className="h-3 w-full bg-muted/40 rounded animate-pulse" style={{ animationDelay: '100ms' }} />
                    <div className="h-3 w-4/5 bg-muted/40 rounded animate-pulse" style={{ animationDelay: '200ms' }} />
                    <div className="h-3 w-full bg-muted/30 rounded animate-pulse" style={{ animationDelay: '300ms' }} />
                    <div className="h-3 w-3/5 bg-muted/30 rounded animate-pulse" style={{ animationDelay: '400ms' }} />
                </div>
            </div>
            <ThinkingIndicator />
        </div>
    )
}

function ThinkingIndicator() {
    return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-3 w-3 border-[1.5px] border-primary border-t-transparent rounded-full animate-spin" />
            <span>Thinking...</span>
        </div>
    )
}

function BlockSkeleton({ expectedPhase }: { expectedPhase: PhaseType | null }) {
    if (expectedPhase === 'approaches') return <ApproachesSkeleton />
    if (expectedPhase === 'design') return <DesignSectionSkeleton />
    return <QuestionSkeleton />
}

// ── Main component ──

export function BrainstormChat({ messages, streaming, finalizing, onSend, onFinalize, projectId }: BrainstormChatProps) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const activeBlockRef = useRef<HTMLDivElement>(null)

    // Scroll to the top of the active block when it changes (not the bottom)
    useEffect(() => {
        if (activeBlockRef.current && scrollRef.current) {
            const container = scrollRef.current
            const block = activeBlockRef.current
            // Scroll so the active block's top is visible with some padding
            const offsetTop = block.offsetTop - container.offsetTop
            container.scrollTo({ top: Math.max(0, offsetTop - 16), behavior: 'smooth' })
        }
    }, [messages, streaming])

    // Determine which messages are "completed" (have a subsequent user response) vs "active"
    const completedPairs: Array<{ assistant: BrainstormMessage; userAnswer: string }> = []
    const activeMessage: BrainstormMessage | null = (() => {
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i]
            if (msg.role === 'assistant' && msg.block) {
                const nextUser = messages[i + 1]
                if (nextUser && nextUser.role === 'user') {
                    completedPairs.push({ assistant: msg, userAnswer: nextUser.content })
                    i++
                } else {
                    return msg
                }
            } else if (msg.role === 'assistant' && !msg.block && msg.content) {
                const nextUser = messages[i + 1]
                if (nextUser && nextUser.role === 'user') {
                    completedPairs.push({ assistant: msg, userAnswer: nextUser.content })
                    i++
                } else {
                    return msg
                }
            }
        }
        return null
    })()

    // Determine the active phase (for showing next phase heading)
    const activePhase: PhaseType | null = activeMessage?.block
        ? getPhaseForBlock(activeMessage.block.type)
        : null

    // Infer expected next phase for skeleton (based on last completed block type)
    const lastCompletedBlock = completedPairs.length > 0
        ? completedPairs[completedPairs.length - 1].assistant.block
        : null
    const expectedNextPhase: PhaseType | null = (() => {
        if (!lastCompletedBlock) return 'questions'
        const lastType = lastCompletedBlock.type
        if (lastType === 'question') return 'questions' // could be another question or approaches
        if (lastType === 'approaches') return 'design'
        if (lastType === 'design-section') return 'design'
        return null
    })()

    // Build history items with phase headings
    const historyItems: Array<
        | { kind: 'phase'; phase: PhaseType }
        | { kind: 'pair'; assistant: BrainstormMessage; userAnswer: string }
    > = []

    let lastPhase: PhaseType | null = null
    for (const pair of completedPairs) {
        const block = pair.assistant.block
        if (block) {
            const phase = getPhaseForBlock(block.type)
            if (phase !== lastPhase) {
                historyItems.push({ kind: 'phase', phase })
                lastPhase = phase
            }
        }
        historyItems.push({ kind: 'pair', ...pair })
    }

    // Determine the next phase heading to show (if active block is a new phase)
    const showActivePhaseHeading = activePhase && activePhase !== lastPhase
    // Also show phase heading before skeleton if we can infer it from the last completed pair
    const streamingPhaseHeading: PhaseType | null = (() => {
        if (!streaming || !lastPhase) return null
        // After all questions are done and we're streaming, next is likely approaches
        // After approaches, it's design. This is a best-guess.
        // We can't know for sure, so only show it if the active message has no block yet
        return null // Let the active block's phase heading handle it
    })()

    const hasConversation = completedPairs.length > 0 || (activeMessage?.block?.type === 'ready')

    return (
        <div className="flex flex-col h-[calc(100vh-12rem)]">
            {/* Scrollable content */}
            <div ref={scrollRef} className="flex-1 overflow-auto pb-4 pr-3">
                {/* History section with phase headings */}
                {historyItems.length > 0 && (
                    <div className="space-y-2 mb-6">
                        {historyItems.map((item, idx) => {
                            if (item.kind === 'phase') {
                                return <PhaseHeading key={`phase-${idx}`} phase={item.phase} />
                            }
                            const { assistant, userAnswer } = item
                            const block = assistant.block
                            if (!block) {
                                return <HistoryFallback key={idx} content={assistant.content} />
                            }
                            switch (block.type) {
                                case 'question':
                                    return <HistoryQuestion key={idx} block={block} answer={userAnswer} />
                                case 'approaches':
                                    return <HistoryApproaches key={idx} block={block} answer={userAnswer} />
                                case 'design-section':
                                    return <HistoryDesignSection key={idx} block={block} answer={userAnswer} />
                                default:
                                    return <HistoryFallback key={idx} content={assistant.content} />
                            }
                        })}
                    </div>
                )}

                {/* Active block with phase heading */}
                <div ref={activeBlockRef} className="view-transition-enter">
                    {/* Phase heading for active block (if it's a new phase) */}
                    {!streaming && !finalizing && showActivePhaseHeading && (
                        <div className="mb-4">
                            <PhaseHeading phase={activePhase} />
                        </div>
                    )}

                    {streamingPhaseHeading && (
                        <div className="mb-4">
                            <PhaseHeading phase={streamingPhaseHeading} />
                        </div>
                    )}

                    {streaming || finalizing ? (
                        finalizing ? (
                            <div className="flex items-center gap-2 text-sm text-primary py-4">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Generating design document...</span>
                            </div>
                        ) : (
                            <BlockSkeleton expectedPhase={expectedNextPhase} />
                        )
                    ) : activeMessage ? (
                        activeMessage.block ? (
                            (() => {
                                switch (activeMessage.block.type) {
                                    case 'question':
                                        return <ActiveQuestionBlock block={activeMessage.block} onSubmit={onSend} projectId={projectId} />
                                    case 'approaches':
                                        return <ActiveApproachesBlock block={activeMessage.block} onSubmit={onSend} />
                                    case 'design-section':
                                        return <ActiveDesignSectionBlock block={activeMessage.block} onSubmit={onSend} />
                                    case 'ready':
                                        return <ActiveReadyBlock block={activeMessage.block} onFinalize={onFinalize} />
                                    default:
                                        return <HistoryFallback content={activeMessage.content} />
                                }
                            })()
                        ) : activeMessage.content ? (
                            <div className="space-y-4">
                                <div className="rounded-lg border border-border bg-card px-4 py-3">
                                    <div className="prose prose-sm prose-tight dark:prose-invert max-w-none">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                            {activeMessage.content}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                                <FallbackInput onSend={onSend} projectId={projectId} />
                            </div>
                        ) : null
                    ) : null}
                </div>
            </div>

            {/* Finalize button in footer when conversation has progressed */}
            {hasConversation && !streaming && !finalizing && activeMessage?.block?.type !== 'ready' && (
                <div className="border-t border-border pt-3 flex justify-end">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onFinalize}
                        className="gap-1.5"
                    >
                        <Sparkles className="h-3.5 w-3.5" />
                        Finalize Design
                    </Button>
                </div>
            )}
        </div>
    )
}

// ── Fallback free-text input (for non-structured responses) ──

function FallbackInput({ onSend, projectId }: { onSend: (msg: string) => void; projectId?: string | null }) {
    const [input, setInput] = useState('')
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [showAutocomplete, setShowAutocomplete] = useState(false)
    const [autocompleteQuery, setAutocompleteQuery] = useState('')
    const [atStartIndex, setAtStartIndex] = useState(-1)

    const handleSend = () => {
        if (input.trim()) {
            onSend(input.trim())
            setInput('')
        }
    }

    const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value
        setInput(newValue)

        const cursorPos = e.target.selectionStart
        const textBeforeCursor = newValue.substring(0, cursorPos)
        const atMatch = textBeforeCursor.match(/@([^\s@]*)$/)
        if (atMatch) {
            setAtStartIndex(textBeforeCursor.lastIndexOf('@'))
            setAutocompleteQuery(atMatch[1])
            setShowAutocomplete(true)
        } else {
            setShowAutocomplete(false)
        }
    }, [])

    const handleFileTagSelect = useCallback((filePath: string) => {
        if (atStartIndex < 0) return
        const before = input.substring(0, atStartIndex)
        const after = input.substring(atStartIndex + 1 + autocompleteQuery.length)
        setInput(`${before}@${filePath} ${after}`)
        setShowAutocomplete(false)
        setAtStartIndex(-1)
        setTimeout(() => textareaRef.current?.focus(), 0)
    }, [input, atStartIndex, autocompleteQuery])

    return (
        <div className="relative overflow-hidden rounded-lg">
            <textarea
                ref={textareaRef}
                className="flex min-h-[80px] w-full rounded-lg border border-input bg-card px-4 py-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring resize-none"
                placeholder="Type your response... (Cmd+Enter to send)"
                value={input}
                onChange={handleTextChange}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && input.trim()) {
                        e.preventDefault()
                        handleSend()
                    }
                }}
            />
            {showAutocomplete && projectId && (
                <FileAutocomplete
                    query={autocompleteQuery}
                    projectId={projectId}
                    onSelect={handleFileTagSelect}
                    onDismiss={() => setShowAutocomplete(false)}
                />
            )}
            <div className="flex justify-end mt-2">
                <Button size="sm" onClick={handleSend} disabled={!input.trim()} className="gap-1.5">
                    Send
                    <ArrowRight className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    )
}
