import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, SkipForward, ImagePlus, X, ArrowRight, ArrowLeft, Check, PenLine } from 'lucide-react'
import { ProjectContextBadge } from '@/shared/components/ProjectContextBadge'
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
    projectContext?: string | null
    scanningProject?: boolean
    attachments: ImageAttachment[]
    onAddAttachment: (attachment: ImageAttachment) => void
    onRemoveAttachment: (id: string) => void
    onPhaseChange?: (phase: FeatureInputPhase) => void
}

export function FeatureInput({ value, onChange, onGenerate, onManualMode, loading, projectContext, scanningProject, attachments, onAddAttachment, onRemoveAttachment, onPhaseChange }: FeatureInputProps) {
    const [phase, setPhaseInternal] = useState<FeatureInputPhase>('describe')
    const [questions, setQuestions] = useState<ClarifyQuestion[]>([])
    const [answers, setAnswers] = useState<Record<string, string>>({})
    const [currentIdx, setCurrentIdx] = useState(0)
    const [showCustomInput, setShowCustomInput] = useState<Record<string, boolean>>({})
    const [error, setError] = useState('')
    const fileInputRef = useRef<HTMLInputElement>(null)

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

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files) return

        for (const file of Array.from(files)) {
            if (!ACCEPTED_TYPES.includes(file.type as typeof ACCEPTED_TYPES[number])) {
                setError(`${file.name}: unsupported format. Use JPEG, PNG, GIF, or WebP.`)
                continue
            }
            if (file.size > MAX_FILE_SIZE) {
                setError(`${file.name}: exceeds 5MB limit.`)
                continue
            }
            if (totalSize + file.size > MAX_TOTAL_SIZE) {
                setError('Total attachment size exceeds 20MB limit.')
                break
            }
            if (attachments.length >= MAX_IMAGES) {
                setError(`Maximum ${MAX_IMAGES} images allowed.`)
                break
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
        }

        // Reset input so same file can be re-selected
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const handleClarify = async () => {
        setError('')
        setPhase('clarifying')
        try {
            const result = await window.relayAPI.clarifyPrd(
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

    if (phase === 'describe') {
        return (
            <div className="space-y-4">
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="feature">Describe the feature you want to build</Label>
                        <ProjectContextBadge projectContext={projectContext} scanning={scanningProject} />
                    </div>
                    <textarea
                        id="feature"
                        className="flex min-h-[200px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                        placeholder="Describe the feature in detail. What should it do? Who is it for? What problem does it solve?"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                    />
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
                        Generate PRD
                    </Button>
                </div>
                {onManualMode && (
                    <div className="border-t border-border pt-4 mt-2">
                        <button
                            onClick={onManualMode}
                            className="w-full py-2.5 rounded-md border border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors"
                        >
                            Skip PRD — add tasks manually
                        </button>
                    </div>
                )}
            </div>
        )
    }

    if (phase === 'clarifying') {
        return (
            <div className="space-y-4">
                <div className="rounded-md border border-border bg-muted/30 p-3">
                    <p className="text-sm text-muted-foreground line-clamp-3">{value}</p>
                </div>
                <div className="flex flex-col items-center gap-3 py-6">
                    <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-muted-foreground">
                        {attachments.length > 0
                            ? 'Analyzing your feature description and attached images...'
                            : 'Analyzing your feature description...'}
                    </p>
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
                                        Generate PRD
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
