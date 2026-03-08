import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, SkipForward } from 'lucide-react'
import { ProjectContextBadge } from '@/shared/components/ProjectContextBadge'

interface ClarifyQuestion {
    id: string
    question: string
    options?: string[]
}

interface FeatureInputProps {
    value: string
    onChange: (value: string) => void
    onGenerate: (clarifications?: string) => void
    loading: boolean
    projectContext?: string | null
    scanningProject?: boolean
}

export function FeatureInput({ value, onChange, onGenerate, loading, projectContext, scanningProject }: FeatureInputProps) {
    const [phase, setPhase] = useState<'describe' | 'clarifying' | 'answering'>('describe')
    const [questions, setQuestions] = useState<ClarifyQuestion[]>([])
    const [answers, setAnswers] = useState<Record<string, string>>({})
    const [error, setError] = useState('')

    const handleClarify = async () => {
        setError('')
        setPhase('clarifying')
        try {
            const result = await window.relayAPI.clarifyPrd(value, projectContext ?? undefined)
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
        }
    }

    const handleSkip = () => {
        onGenerate()
    }

    const handleGenerate = () => {
        const clarifications = questions
            .map((q) => {
                const answer = answers[q.id]?.trim()
                if (!answer) return null
                return `Q: ${q.question}\nA: ${answer}`
            })
            .filter(Boolean)
            .join('\n\n')

        onGenerate(clarifications || undefined)
    }

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

    const hasAnswers = Object.values(answers).some((a) => a.trim())

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
                {error && (
                    <p className="text-sm text-destructive text-center">{error}</p>
                )}
                <div className="flex gap-2">
                    <Button onClick={handleClarify} disabled={!value.trim() || loading} className="flex-1">
                        Generate PRD
                    </Button>
                </div>
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
                    <p className="text-sm text-muted-foreground">Analyzing your feature description...</p>
                </div>
            </div>
        )
    }

    // phase === 'answering'
    return (
        <div className="space-y-4">
            <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-sm text-muted-foreground line-clamp-3">{value}</p>
            </div>

            <div className="space-y-1">
                <p className="text-sm font-medium">A few questions to refine the PRD</p>
                <p className="text-xs text-muted-foreground">Answer what you can — skip the rest and we'll make reasonable assumptions.</p>
            </div>

            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                {questions.map((q, idx) => (
                    <div key={q.id} className="space-y-2">
                        <Label className="text-sm">
                            {idx + 1}. {q.question}
                        </Label>
                        {q.options && q.options.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {q.options.map((opt) => (
                                    <button
                                        key={opt}
                                        type="button"
                                        onClick={() => selectOption(q.id, opt)}
                                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                                            answers[q.id] === opt
                                                ? 'bg-primary text-primary-foreground border-primary'
                                                : 'bg-muted/50 border-border hover:border-primary/50 text-muted-foreground'
                                        }`}
                                    >
                                        {opt}
                                    </button>
                                ))}
                            </div>
                        )}
                        <textarea
                            className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                            placeholder="Your answer (optional)"
                            value={answers[q.id] || ''}
                            onChange={(e) => setAnswer(q.id, e.target.value)}
                        />
                    </div>
                ))}
            </div>

            {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
            )}

            <div className="flex gap-2">
                <Button
                    variant="outline"
                    onClick={handleSkip}
                    disabled={loading}
                    className="gap-1.5"
                >
                    <SkipForward className="h-3.5 w-3.5" />
                    Skip
                </Button>
                <Button onClick={handleGenerate} disabled={loading} className="flex-1">
                    {loading ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Generating PRD...
                        </>
                    ) : (
                        hasAnswers ? 'Generate PRD' : 'Generate PRD (with defaults)'
                    )}
                </Button>
            </div>
        </div>
    )
}
