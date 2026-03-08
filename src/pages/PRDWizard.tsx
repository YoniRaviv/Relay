import { useState, useCallback, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StepIndicator, FeatureInput, PRDPreview, PRDEditor, TaskReview } from '@/modules/prd'
import { useRelayStore } from '@/store/useRelayStore'
import { useIpcListener } from '@/shared/hooks/useIpcListener'
import type { DecomposedTask } from '@/shared/types/prd'

const STEPS = ['Describe', 'Review PRD', 'Edit', 'Tasks', 'Confirm']

interface PRDWizardProps {
    onComplete: () => void
    onBack: () => void
}

export function PRDWizard({ onComplete, onBack }: PRDWizardProps) {
    const {
        activeProject,
        projectContext,
        scanningProject,
        wizardStep,
        setWizardStep,
        featureDescription,
        setFeatureDescription,
        prdMarkdown,
        setPrdMarkdown,
    } = useRelayStore()

    const [streaming, setStreaming] = useState(false)
    const [decomposing, setDecomposing] = useState(false)
    const [saving, setSaving] = useState(false)
    const [tasks, setTasks] = useState<DecomposedTask[]>([])
    const [error, setError] = useState('')
    const [agentStatus, setAgentStatus] = useState('')

    // Simulated streaming for CLI mode (large chunks arrive at once)
    const textQueueRef = useRef('')
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const doneReceivedRef = useRef(false)

    const revealQueue = useCallback(() => {
        // Already ticking — let it continue
        if (timerRef.current) return

        const tick = () => {
            const queue = textQueueRef.current
            if (!queue) {
                timerRef.current = null
                if (doneReceivedRef.current) {
                    doneReceivedRef.current = false
                    setStreaming(false)
                    setWizardStep(1)
                }
                return
            }

            // Small chunks + delay = chat-like typing feel
            const baseChunk = 12 + Math.floor(Math.random() * 18) // 12-30 chars
            let end = Math.min(baseChunk, queue.length)

            // Break at a natural point (newline or space)
            if (end < queue.length) {
                const newline = queue.indexOf('\n', end - 5)
                if (newline !== -1 && newline < end + 15) {
                    end = newline + 1
                } else {
                    const space = queue.indexOf(' ', end)
                    if (space !== -1 && space < end + 10) {
                        end = space + 1
                    }
                }
            }

            const chunk = queue.slice(0, end)
            textQueueRef.current = queue.slice(end)

            setPrdMarkdown((prev: string) => prev + chunk)

            // ~25-40ms per tick — feels like fast human typing
            const delay = 20 + Math.floor(Math.random() * 20)
            timerRef.current = setTimeout(tick, delay)
        }

        tick()
    }, [setPrdMarkdown, setWizardStep])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            textQueueRef.current = ''
            doneReceivedRef.current = false
            if (timerRef.current) {
                clearTimeout(timerRef.current)
                timerRef.current = null
            }
        }
    }, [])

    // Listen for PRD stream events
    useIpcListener('prd:stream', useCallback((data: unknown) => {
        const event = data as { type: string; text: string }
        if (event.type === 'delta') {
            const STREAM_THRESHOLD = 200
            if (event.text.length > STREAM_THRESHOLD) {
                // Large chunk (CLI mode) — queue for progressive reveal
                textQueueRef.current += event.text
                revealQueue()
            } else {
                // Small delta (API streaming) — append immediately
                setPrdMarkdown((prev: string) => prev + event.text)
            }
        }
        if (event.type === 'done') {
            if (textQueueRef.current || timerRef.current) {
                // Still revealing — defer finalization until queue drains
                doneReceivedRef.current = true
            } else {
                setStreaming(false)
                setWizardStep(1)
            }
        }
    }, [setPrdMarkdown, setWizardStep, revealQueue]))

    useIpcListener('prd:status', useCallback((data: unknown) => {
        const event = data as { status: string }
        setAgentStatus(event.status)
    }, []))

    useIpcListener('prd:decomposeStream', useCallback((data: unknown) => {
        const event = data as { type: string; text: string }
        if (event.type === 'done') {
            try {
                const jsonMatch = event.text.match(/\[[\s\S]*\]/)
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]) as DecomposedTask[]
                    setTasks(parsed)
                }
            } catch {
                setError('Failed to parse tasks. Please try again.')
            }
            setDecomposing(false)
            setWizardStep(3)
        }
    }, [setWizardStep]))

    const generatePrd = useCallback(async (clarifications?: string) => {
        setError('')
        setAgentStatus('')
        setStreaming(true)
        setPrdMarkdown('')
        try {
            await window.relayAPI.generatePrd(featureDescription, clarifications, projectContext ?? undefined)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate PRD')
            setStreaming(false)
        }
    }, [featureDescription, setPrdMarkdown])

    const decompose = useCallback(async () => {
        setError('')
        setAgentStatus('')
        setDecomposing(true)
        try {
            await window.relayAPI.decomposePrd(prdMarkdown, projectContext ?? undefined)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to decompose PRD')
            setDecomposing(false)
        }
    }, [prdMarkdown])

    const confirmTasks = useCallback(async () => {
        if (!activeProject) return
        setSaving(true)
        setError('')
        try {
            await window.relayAPI.savePrd({
                projectId: activeProject.id,
                description: featureDescription,
                markdown: prdMarkdown,
                tasks,
            })
            onComplete()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save')
            setSaving(false)
        }
    }, [activeProject, featureDescription, prdMarkdown, tasks, onComplete])

    const removeTasks = (index: number) => {
        setTasks((prev) => prev.filter((_, i) => i !== index))
    }

    const effectiveStep = streaming ? 1 : decomposing ? 3 : wizardStep

    // Wider layout for content-heavy steps (PRD review, edit, tasks)
    const isWideStep = effectiveStep >= 1

    const handleBack = () => {
        // Don't allow back while streaming/decomposing
        if (streaming || decomposing) return

        if (wizardStep === 0) {
            // First step — exit wizard entirely
            onBack()
        } else if (wizardStep === 2) {
            // Edit → back to Review PRD
            setWizardStep(1)
        } else if (wizardStep === 3) {
            // Tasks → back to Review PRD
            setWizardStep(1)
        } else {
            // Review PRD → back to Describe (keep description intact)
            setWizardStep(0)
        }
    }

    return (
        <div className="flex items-center justify-center min-h-screen p-6">
            <Card className={`w-full transition-all duration-300 ${isWideStep ? 'max-w-4xl' : 'max-w-2xl'}`}>
                <CardHeader className="text-center relative">
                    <button
                        onClick={handleBack}
                        disabled={streaming || decomposing}
                        className="absolute left-6 top-6 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none"
                    >
                        &larr; Back
                    </button>
                    <CardTitle className="text-xl">Create A New Feature</CardTitle>
                </CardHeader>
                <CardContent>
                    <StepIndicator steps={STEPS} currentStep={effectiveStep} />

                    {error && (
                        <p className="text-sm text-destructive mb-4 text-center">{error}</p>
                    )}

                    <div key={effectiveStep} className="view-transition-enter">
                        {wizardStep === 0 && !streaming && (
                            <FeatureInput
                                value={featureDescription}
                                onChange={setFeatureDescription}
                                onGenerate={generatePrd}
                                loading={streaming}
                                projectContext={projectContext}
                                scanningProject={scanningProject}
                            />
                        )}

                        {(wizardStep === 1 || streaming) && !decomposing && (
                            <PRDPreview
                                markdown={prdMarkdown}
                                streaming={streaming}
                                agentStatus={agentStatus}
                                onEdit={() => setWizardStep(2)}
                                onApprove={decompose}
                            />
                        )}

                        {wizardStep === 2 && (
                            <PRDEditor
                                markdown={prdMarkdown}
                                onChange={setPrdMarkdown}
                                onSave={() => setWizardStep(1)}
                            />
                        )}

                        {(wizardStep === 3 || decomposing) && (
                            decomposing ? (
                                <div className="flex flex-col items-center gap-3 py-8">
                                    <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                    <p className="text-sm text-muted-foreground">{agentStatus || 'Decomposing PRD into tasks...'}</p>
                                </div>
                            ) : (
                                <TaskReview
                                    tasks={tasks}
                                    onRemove={removeTasks}
                                    onConfirm={confirmTasks}
                                    loading={saving}
                                />
                            )
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
