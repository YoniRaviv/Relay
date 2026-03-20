import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, SkipForward, ImagePlus, X, ArrowRight, ArrowLeft, Check, PenLine, FileCode } from 'lucide-react'
import { ProjectContextBadge } from '@/shared/components/ProjectContextBadge'
import { FileAutocomplete } from './FileAutocomplete'
import type { ImageAttachment } from '@shared/types'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB per file
const MAX_TOTAL_SIZE = 20 * 1024 * 1024 // 20MB total
const MAX_IMAGES = 10
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const

interface ClarifyQuestion {
    id: string
    question: string
    options?: string[]
}

export type FeatureInputPhase = 'describe' | 'clarifying' | 'answering'

interface FeatureInputProps {
    value: string
    onChange: (value: string) => void
    onGenerate: (clarifications?: string) => void
    onManualMode?: () => void
    loading: boolean
    projectId?: string | null
    projectContext?: string | null
    scanningProject?: boolean
    attachments: ImageAttachment[]
    onAddAttachment: (attachment: ImageAttachment) => void
    onRemoveAttachment: (id: string) => void
    onPhaseChange?: (phase: FeatureInputPhase) => void
}

export function FeatureInput({ value, onChange, onGenerate, onManualMode, loading, projectId, projectContext, scanningProject, attachments, onAddAttachment, onRemoveAttachment, onPhaseChange }: FeatureInputProps) {
    const [phase, setPhaseInternal] = useState<FeatureInputPhase>('describe')
    const [questions, setQuestions] = useState<ClarifyQuestion[]>([])
    const [answers, setAnswers] = useState<Record<string, string>>({})
    const [currentIdx, setCurrentIdx] = useState(0)
    const [showCustomInput, setShowCustomInput] = useState<Record<string, boolean>>({})
    const [error, setError] = useState('')
    const fileInputRef = useRef<HTMLInputElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [showAutocomplete, setShowAutocomplete] = useState(false)
    const [autocompleteQuery, setAutocompleteQuery] = useState('')
    const [atStartIndex, setAtStartIndex] = useState(-1)

    const setPhase = useCallback((p: FeatureInputPhase) => {
        setPhaseInternal(p)
        onPhaseChange?.(p)
    }, [onPhaseChange])

    // Reset custom input visibility when changing questions
    useEffect(() => {
        if (questions.length === 0) return
        const q = questions[currentIdx]
        if (!q) return
        // Show custom input if user typed something that isn't one of the options
        const answer = answers[q.id] || ''
        const isCustom = answer && q.options && !q.options.includes(answer)
        if (isCustom) setShowCustomInput(prev => ({ ...prev, [q.id]: true }))
    }, [currentIdx, questions, answers])

    const totalSize = attachments.reduce((sum, a) => sum + a.sizeBytes, 0)

    const processFile = useCallback((file: File) => {
        if (!ACCEPTED_TYPES.includes(file.type as typeof ACCEPTED_TYPES[number])) {
            setError(`${file.name}: unsupported format. Use JPEG, PNG, GIF, or WebP.`)
            return
        }
        if (file.size > MAX_FILE_SIZE) {
            setError(`${file.name}: exceeds 5MB limit.`)
            return
        }
        if (totalSize + file.size > MAX_TOTAL_SIZE) {
            setError('Total attachment size exceeds 20MB limit.')
            return
        }
        if (attachments.length >= MAX_IMAGES) {
            setError(`Maximum ${MAX_IMAGES} images allowed.`)
            return
        }

        const reader = new FileReader()
        reader.onload = () => {
            const dataUrl = reader.result as string
            const base64Data = dataUrl.split(',')[1]
            onAddAttachment({
                id: crypto.randomUUID(),
                name: file.name,
                mediaType: file.type as ImageAttachment['mediaType'],
                base64Data,
                sizeBytes: file.size,
            })
        }
        reader.readAsDataURL(file)
    }, [totalSize, attachments.length, onAddAttachment])

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items
        if (!items) return

        for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
                e.preventDefault()
                const file = item.getAsFile()
                if (file) processFile(file)
            }
        }
    }, [processFile])

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files) return

        for (const file of Array.from(files)) {
            processFile(file)
        }

        // Reset input so same file can be re-selected
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value
        onChange(newValue)

        const cursorPos = e.target.selectionStart
        const textBeforeCursor = newValue.substring(0, cursorPos)
        const atMatch = textBeforeCursor.match(/@([^\s@]*)$/)

        if (atMatch) {
            const atPos = textBeforeCursor.lastIndexOf('@')
            setAtStartIndex(atPos)
            setAutocompleteQuery(atMatch[1])
            setShowAutocomplete(true)
        } else {
            setShowAutocomplete(false)
        }
    }, [onChange])

    const handleFileTagSelect = useCallback((filePath: string) => {
        if (atStartIndex < 0) return
        const before = value.substring(0, atStartIndex)
        const after = value.substring(atStartIndex + 1 + autocompleteQuery.length)
        const newValue = `${before}@${filePath} ${after}`
        onChange(newValue)
        setShowAutocomplete(false)
        setAtStartIndex(-1)
        setTimeout(() => textareaRef.current?.focus(), 0)
    }, [value, onChange, atStartIndex, autocompleteQuery])

    const handleClarify = async () => {
        setError('')
        setPhase('clarifying')
        try {
            const result = await window.relayAPI.clarifyPrd(
                projectId ?? '',
                value,
                projectContext ?? undefined,
                attachments.length > 0 ? attachments : undefined,
            )
            const jsonMatch = result.text.match(/\[[\s\S]*\]/)
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]) as ClarifyQuestion[]
                setQuestions(parsed)
                setPhase('answering')
            } else {
                // No questions needed — generate directly
                onGenerate()
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to get clarifying questions')
            setPhase('describe')
            setCurrentIdx(0)
            setQuestions([])
            setAnswers({})
            setShowCustomInput({})
        }
    }

    const handleSkip = () => {
        onGenerate()
    }

    const handleGenerate = useCallback(() => {
        const clarifications = questions
            .map((q) => {
                const answer = answers[q.id]?.trim()
                if (!answer) return null
                return `Q: ${q.question}\nA: ${answer}`
            })
            .filter(Boolean)
            .join('\n\n')

        onGenerate(clarifications || undefined)
    }, [questions, answers, onGenerate])

    const setAnswer = (id: string, value: string) => {
        setAnswers((prev) => ({ ...prev, [id]: value }))
    }

    const selectOption = (id: string, option: string) => {
        setAnswers((prev) => {
            const current = prev[id] || ''
            // Toggle: if already selected, remove it; otherwise set it
            return { ...prev, [id]: current === option ? '' : option }
        })
    }

    // Derived state for answering phase
    const currentQuestion = questions[currentIdx] ?? null
    const isLastQuestion = currentIdx === questions.length - 1
    const currentAnswer = currentQuestion ? (answers[currentQuestion.id] || '') : ''
    const isCustomVisible = currentQuestion ? (showCustomInput[currentQuestion.id] ?? false) : false

    // Keyboard navigation for answering phase
    useEffect(() => {
        if (phase !== 'answering') return
        const handler = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLTextAreaElement) return
            if (e.key === 'Enter' && currentAnswer) {
                e.preventDefault()
                if (isLastQuestion) handleGenerate()
                else setCurrentIdx(i => i + 1)
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [phase, currentAnswer, isLastQuestion, handleGenerate])

    const attachmentStrip = attachments.length > 0 && (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
                {attachments.map((att) => (
                    <div key={att.id} className="relative group">
                        <img
                            src={`data:${att.mediaType};base64,${att.base64Data}`}
                            alt={att.name}
                            className="h-16 w-16 rounded-md border border-border object-cover"
                        />
                        <button
                            type="button"
                            onClick={() => onRemoveAttachment(att.id)}
                            className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <X className="h-3 w-3" />
                        </button>
                        <p className="text-[10px] text-muted-foreground truncate w-16 mt-0.5">{att.name}</p>
                    </div>
                ))}
            </div>
            <p className="text-[11px] text-muted-foreground">{attachments.length}/{MAX_IMAGES} images</p>
        </div>
    )

    // Extract @file references from text for display as chips
    const fileRefs = Array.from(new Set(
        (value.match(/@([\w.\/\-()[\]{}]+\.\w+)/g) || []).map(m => m.slice(1))
    ))

    const removeFileRef = (ref: string) => {
        const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        onChange(value.replace(new RegExp(`@${escaped}\\s?`, 'g'), ''))
    }

    const fileTagStrip = fileRefs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
            {fileRefs.map((ref) => (
                <span
                    key={ref}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-xs font-mono text-primary"
                >
                    <FileCode className="h-3 w-3" />
                    <span className="max-w-[200px] truncate">{ref}</span>
                    <button
                        type="button"
                        onClick={() => removeFileRef(ref)}
                        className="ml-0.5 text-primary/60 hover:text-primary transition-colors"
                    >
                        <X className="h-2.5 w-2.5" />
                    </button>
                </span>
            ))}
        </div>
    )

    if (phase === 'describe') {
        return (
            <div className="space-y-4">
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="feature">Describe the feature you want to build</Label>
                        <ProjectContextBadge projectContext={projectContext} scanning={scanningProject} />
                    </div>
                    <div className="relative">
                        <textarea
                            ref={textareaRef}
                            id="feature"
                            className="flex min-h-[200px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                            placeholder="Describe the feature in detail. Use @filename to reference project files. Paste images with Cmd+V."
                            value={value}
                            onChange={handleTextChange}
                            onPaste={handlePaste}
                        />
                        {showAutocomplete && projectId && (
                            <FileAutocomplete
                                query={autocompleteQuery}
                                projectId={projectId}
                                onSelect={handleFileTagSelect}
                                onDismiss={() => setShowAutocomplete(false)}
                            />
                        )}
                    </div>
                    {fileTagStrip}
                </div>
                {attachmentStrip}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                />
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={attachments.length >= MAX_IMAGES}
                        className="gap-1.5"
                    >
                        <ImagePlus className="h-3.5 w-3.5" />
                        Attach images
                    </Button>
                </div>
                {error && (
                    <p className="text-sm text-destructive text-center">{error}</p>
                )}
                <div className="flex gap-2">
                    <Button onClick={handleClarify} disabled={!value.trim() || loading} className="flex-1">
                        Generate Specification
                    </Button>
                </div>
                {onManualMode && (
                    <div className="border-t border-border pt-4 mt-2">
                        <button
                            onClick={onManualMode}
                            className="w-full py-2.5 rounded-md border border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors"
                        >
                            Skip specification — add tasks manually
                        </button>
                    </div>
                )}
            </div>
        )
    }

    if (phase === 'clarifying') {
        return (
            <div className="space-y-6">
                {/* Description with shimmer */}
                <div className="rounded-lg border border-primary/20 bg-card p-4 shimmer-overlay">
                    <p className="text-sm text-foreground/70 leading-relaxed whitespace-pre-wrap line-clamp-4">{value}</p>
                    {attachments.length > 0 && (
                        <div className="flex gap-1.5 mt-3">
                            {attachments.map((att) => (
                                <img
                                    key={att.id}
                                    src={`data:${att.mediaType};base64,${att.base64Data}`}
                                    alt={att.name}
                                    className="h-8 w-8 rounded border border-border object-cover opacity-60"
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Skeleton question layout */}
                <div className="space-y-5">
                    {/* Skeleton progress pills */}
                    <div className="flex items-center gap-1.5">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="h-7 w-7 rounded-md bg-muted animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
                        ))}
                        <div className="h-3 w-10 bg-muted/50 rounded ml-2 animate-pulse" />
                    </div>

                    {/* Skeleton question heading */}
                    <div className="space-y-2">
                        <div className="h-5 w-4/5 bg-muted rounded animate-pulse" />
                        <div className="h-5 w-3/5 bg-muted/70 rounded animate-pulse" />
                    </div>

                    {/* Skeleton option cards */}
                    <div className="space-y-2">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border/40 bg-card/30" style={{ opacity: 1 - i * 0.15 }}>
                                <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/20 shrink-0" />
                                <div className="h-4 rounded bg-muted/50 animate-pulse" style={{ width: `${75 - i * 12}%`, animationDelay: `${i * 150}ms` }} />
                            </div>
                        ))}
                    </div>

                    {/* Skeleton navigation */}
                    <div className="flex items-center gap-2 pt-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <div className="h-3 w-3 border-[1.5px] border-primary border-t-transparent rounded-full animate-spin" />
                            <span>Preparing questions...</span>
                        </div>
                        <div className="flex-1" />
                        <div className="h-8 w-24 bg-muted/40 rounded-md animate-pulse" />
                        <div className="h-8 w-20 bg-muted/60 rounded-md animate-pulse" />
                    </div>
                </div>
            </div>
        )
    }

    // phase === 'answering'
    return (
        <div className="space-y-6">
            {/* Description above questions */}
            <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap line-clamp-4">
                            {value}
                        </p>
                    </div>
                    {attachments.length > 0 && (
                        <div className="flex gap-1.5 shrink-0">
                            {attachments.map((att) => (
                                <img
                                    key={att.id}
                                    src={`data:${att.mediaType};base64,${att.base64Data}`}
                                    alt={att.name}
                                    className="h-10 w-10 rounded border border-border object-cover"
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Progress pills */}
            <div className="flex items-center gap-1.5">
                {questions.map((q, idx) => {
                    const isAnswered = !!answers[q.id]?.trim()
                    const isCurrent = idx === currentIdx
                    return (
                        <button
                            key={q.id}
                            onClick={() => setCurrentIdx(idx)}
                            className={`h-7 min-w-[28px] px-2 rounded-md text-xs font-medium transition-all ${
                                isCurrent
                                    ? 'bg-primary text-primary-foreground'
                                    : isAnswered
                                        ? 'bg-primary/15 text-primary border border-primary/20'
                                        : 'bg-muted text-muted-foreground'
                            }`}
                        >
                            {isAnswered && !isCurrent ? (
                                <Check className="h-3 w-3 mx-auto" />
                            ) : (
                                idx + 1
                            )}
                        </button>
                    )
                })}
                <span className="text-xs text-muted-foreground ml-2">
                    {currentIdx + 1} of {questions.length}
                </span>
            </div>

            {/* Current question */}
            {currentQuestion && (
                <div key={currentQuestion.id} className="view-transition-enter">
                    <h3 className="text-base font-medium text-foreground mb-5 leading-snug">
                        {currentQuestion.question}
                    </h3>

                    {/* Option cards */}
                    {currentQuestion.options && currentQuestion.options.length > 0 && (
                        <div className="space-y-2 mb-4">
                            {currentQuestion.options.map((opt) => {
                                const isSelected = answers[currentQuestion.id] === opt
                                return (
                                    <button
                                        key={opt}
                                        type="button"
                                        onClick={() => {
                                            selectOption(currentQuestion.id, opt)
                                            setShowCustomInput(prev => ({ ...prev, [currentQuestion.id]: false }))
                                        }}
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

                    {/* Custom answer toggle + textarea */}
                    {currentQuestion.options && currentQuestion.options.length > 0 && !isCustomVisible && (
                        <button
                            type="button"
                            onClick={() => {
                                setShowCustomInput(prev => ({ ...prev, [currentQuestion.id]: true }))
                                setAnswers(prev => ({ ...prev, [currentQuestion.id]: '' }))
                            }}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
                        >
                            <PenLine className="h-3 w-3" />
                            Type a custom answer instead
                        </button>
                    )}

                    {/* Show textarea if no options or custom mode active */}
                    {(!currentQuestion.options || currentQuestion.options.length === 0 || isCustomVisible) && (
                        <div className="mb-4">
                            <textarea
                                className="flex min-h-[80px] w-full rounded-lg border border-input bg-card px-4 py-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                                placeholder="Type your answer..."
                                value={answers[currentQuestion.id] || ''}
                                onChange={(e) => setAnswer(currentQuestion.id, e.target.value)}
                                autoFocus
                            />
                            {isCustomVisible && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowCustomInput(prev => ({ ...prev, [currentQuestion.id]: false }))
                                        setAnswers(prev => ({ ...prev, [currentQuestion.id]: '' }))
                                    }}
                                    className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
                                >
                                    Back to options
                                </button>
                            )}
                        </div>
                    )}

                    {error && (
                        <p className="text-sm text-destructive mb-4">{error}</p>
                    )}

                    {/* Navigation */}
                    <div className="flex items-center gap-2 pt-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setCurrentIdx(i => i - 1)}
                            disabled={currentIdx === 0}
                            className="gap-1.5"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            Back
                        </Button>

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                if (isLastQuestion) handleGenerate()
                                else setCurrentIdx(i => i + 1)
                            }}
                            className="text-muted-foreground"
                        >
                            Skip
                        </Button>

                        <div className="flex-1" />

                        <Button
                            variant="outline"
                            onClick={handleSkip}
                            disabled={loading}
                            className="gap-1.5"
                        >
                            <SkipForward className="h-3.5 w-3.5" />
                            Skip all questions
                        </Button>

                        {isLastQuestion ? (
                            <Button onClick={handleGenerate} disabled={loading} className="gap-1.5">
                                {loading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        Generate Specification
                                        <ArrowRight className="h-3.5 w-3.5" />
                                    </>
                                )}
                            </Button>
                        ) : (
                            <Button
                                onClick={() => setCurrentIdx(i => i + 1)}
                                disabled={!currentAnswer}
                                className="gap-1.5"
                            >
                                Next
                                <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
