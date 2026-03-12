import { useState, useCallback, useRef, useEffect } from 'react'
import { StepIndicator, FeatureInput, PRDPreview, PRDEditor, TaskReview } from '@/modules/prd'
import { useRelayStore } from '@/store/useRelayStore'
import { useIpcListener } from '@/shared/hooks/useIpcListener'
import { ArrowLeft } from 'lucide-react'
import type { DecomposedTask } from '@/shared/types/prd'
import type { Attachment } from '@shared/types'

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
    const [attachments, setAttachments] = useState<Attachment[]>([])

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
                } else {
                    setError('No tasks were returned. The AI response did not contain a valid task list. Please try again.')
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
            await window.relayAPI.generatePrd(
                featureDescription,
                clarifications,
                projectContext ?? undefined,
                attachments.length > 0 ? attachments : undefined,
            )
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate PRD')
            setStreaming(false)
        }
    }, [featureDescription, setPrdMarkdown, projectContext, attachments])

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
    }, [prdMarkdown, projectContext])

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

    const updateTask = (index: number, updated: DecomposedTask) => {
        setTasks((prev) => prev.map((t, i) => i === index ? updated : t))
    }

    const effectiveStep = streaming ? 1 : decomposing ? 3 : wizardStep

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
        <div className="flex h-screen">
            {/* ── Step Rail ── */}
            <aside className="w-56 bg-sidebar border-r border-border flex flex-col shrink-0">
                {/* Back / header */}
                <div className="p-5 pb-3">
                    <button
                        onClick={handleBack}
                        disabled={streaming || decomposing}
                        className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none mb-6"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Back
                    </button>
                    <h2 className="text-sm font-semibold text-foreground tracking-tight">
                        New Feature
                    </h2>
                    {activeProject && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            {activeProject.name}
                        </p>
                    )}
                </div>

                {/* Steps */}
                <div className="px-5 py-2 flex-1">
                    <StepIndicator steps={STEPS} currentStep={effectiveStep} />
                </div>

                {/* Feature description context */}
                {featureDescription && effectiveStep > 0 && (
                    <div className="px-5 pb-5 mt-auto">
                        <div className="border-t border-border pt-4">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium mb-1.5">
                                Feature
                            </p>
                            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
                                {featureDescription}
                            </p>
                        </div>
                    </div>
                )}
            </aside>

            {/* ── Content Area ── */}
            <main className="flex-1 overflow-auto">
                <div className={`mx-auto px-10 py-10 transition-all duration-300 ${
                    effectiveStep === 3 && !decomposing ? 'max-w-6xl' : 'max-w-3xl'
                }`}>
                    {/* Step title */}
                    <div className="mb-8">
                        <h1 className="text-lg font-semibold text-foreground">
                            {effectiveStep === 0 && 'Describe your feature'}
                            {effectiveStep === 1 && (streaming ? 'Generating PRD...' : 'Review your PRD')}
                            {effectiveStep === 2 && 'Edit PRD'}
                            {effectiveStep === 3 && (decomposing ? 'Decomposing into tasks...' : 'Review tasks')}
                            {effectiveStep === 4 && 'Confirm'}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            {effectiveStep === 0 && 'What are you building? Be as detailed as you like.'}
                            {effectiveStep === 1 && (streaming ? 'Claude is writing the product requirements.' : 'Make sure this captures what you want to build.')}
                            {effectiveStep === 2 && 'Refine the markdown directly, then save.'}
                            {effectiveStep === 3 && (decomposing ? 'Breaking the PRD into buildable tasks.' : 'Remove any tasks that aren\'t needed, then start building.')}
                        </p>
                    </div>

                    {error && (
                        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 mb-6">
                            <p className="text-sm text-destructive">{error}</p>
                        </div>
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
                                attachments={attachments}
                                onAttachmentsChange={setAttachments}
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
                                <div className="flex flex-col items-center gap-3 py-16">
                                    <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                    <p className="text-sm text-muted-foreground">{agentStatus || 'Decomposing PRD into tasks...'}</p>
                                </div>
                            ) : (
                                <TaskReview
                                    tasks={tasks}
                                    onRemove={removeTasks}
                                    onUpdate={updateTask}
                                    onConfirm={confirmTasks}
                                    loading={saving}
                                />
                            )
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}
