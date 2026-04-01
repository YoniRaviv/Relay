import { useState, useCallback, useRef, useEffect } from 'react'
import { StepIndicator, FeatureInput, PRDPreview, PRDEditor, TaskReview, BrainstormChat } from '@/modules/prd'
import type { FeatureInputPhase } from '@/modules/prd'
import { useRelayStore } from '@/store/useRelayStore'
import { useIpcListener } from '@/shared/hooks/useIpcListener'
import { ArrowLeft } from 'lucide-react'
import type { DecomposedTask } from '@/shared/types/prd'

const PRD_STEPS = ['Describe', 'Review Specification', 'Edit', 'Tasks', 'Confirm']
const BRAINSTORM_STEPS = ['Describe', 'Brainstorm', 'Review Design', 'Edit', 'Tasks', 'Confirm']
const MANUAL_STEPS = ['Describe', 'Add Tasks', 'Confirm']

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
        wizardMode,
        setWizardMode,
        featureName,
        setFeatureName,
        featureDescription,
        setFeatureDescription,
        prdMarkdown,
        setPrdMarkdown,
        featureAttachments,
        addFeatureAttachment,
        removeFeatureAttachment,
        includeTests,
        setIncludeTests,
        brainstormSessionId,
        setBrainstormSessionId,
        brainstormMessages,
        addBrainstormMessage,
        updateLastBrainstormMessage,
        setLastBrainstormBlock,
        clearBrainstormState,
    } = useRelayStore()

    const [streaming, setStreaming] = useState(false)
    const [decomposing, setDecomposing] = useState(false)
    const [featurePhase, setFeaturePhase] = useState<FeatureInputPhase>('describe')
    const [saving, setSaving] = useState(false)
    const [tasks, setTasks] = useState<DecomposedTask[]>([])
    const [error, setError] = useState('')
    const [agentStatus, setAgentStatus] = useState('')
    const [manualMode, setManualMode] = useState(false)
    const [brainstormStreaming, setBrainstormStreaming] = useState(false)
    const [brainstormFinalizing, setBrainstormFinalizing] = useState(false)

    // Simulated streaming for CLI mode (large chunks arrive at once)
    const textQueueRef = useRef('')
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const doneReceivedRef = useRef(false)
    const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
            if (safetyTimeoutRef.current) {
                clearTimeout(safetyTimeoutRef.current)
                safetyTimeoutRef.current = null
            }
        }
    }, [])

    // Clean up brainstorm session on unmount
    useEffect(() => {
        return () => {
            const sessionId = useRelayStore.getState().brainstormSessionId
            if (sessionId) {
                window.relayAPI.brainstormCleanup(sessionId)
            }
        }
    }, [])

    // Listen for brainstorm structured message events (non-streaming conversation turns)
    useIpcListener('brainstorm:message', useCallback((data: unknown) => {
        const event = data as { type: string; block?: unknown; rawText?: string; text?: string }

        if (event.type === 'thinking') {
            setBrainstormStreaming(true)
        }
        if (event.type === 'block' && event.block) {
            updateLastBrainstormMessage(event.rawText ?? '')
            setLastBrainstormBlock(event.block as import('@shared/types').BrainstormBlock)
            setBrainstormStreaming(false)
        }
        if (event.type === 'fallback' && event.text) {
            updateLastBrainstormMessage(event.text)
            setBrainstormStreaming(false)
        }
        if (event.type === 'error') {
            setBrainstormStreaming(false)
            setError(event.text ?? 'Brainstorm failed')
        }
    }, [updateLastBrainstormMessage, setLastBrainstormBlock]))

    // Listen for brainstorm finalize stream events (streaming design document)
    useIpcListener('brainstorm:stream', useCallback((data: unknown) => {
        const event = data as { type: string; text: string }

        if (event.type === 'finalize-delta') {
            setPrdMarkdown((prev: string) => prev + event.text)
        }
        if (event.type === 'finalize-done') {
            setBrainstormFinalizing(false)
            setWizardStep(2)
        }
        if (event.type === 'error') {
            setBrainstormFinalizing(false)
            setError(event.text)
        }
    }, [setPrdMarkdown, setWizardStep]))

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
            // Clear safety timeout — generation completed
            if (safetyTimeoutRef.current) { clearTimeout(safetyTimeoutRef.current); safetyTimeoutRef.current = null }
            if (textQueueRef.current || timerRef.current) {
                // Still revealing — defer finalization until queue drains
                doneReceivedRef.current = true
            } else {
                setStreaming(false)
                setWizardStep(1)
            }
        }
        if (event.type === 'error') {
            if (safetyTimeoutRef.current) { clearTimeout(safetyTimeoutRef.current); safetyTimeoutRef.current = null }
            setStreaming(false)
            setPrdMarkdown('')
            setError(event.text)
        }
    }, [setPrdMarkdown, setWizardStep, revealQueue]))

    useIpcListener('prd:status', useCallback((data: unknown) => {
        const event = data as { status: string }
        setAgentStatus(event.status)
    }, []))

    useIpcListener('prd:decomposeStream', useCallback((data: unknown) => {
        const event = data as { type: string; text: string }
        if (event.type === 'done') {
            let parsed: DecomposedTask[] | null = null
            try {
                const jsonMatch = event.text.match(/\[[\s\S]*\]/)
                if (jsonMatch) {
                    parsed = JSON.parse(jsonMatch[0]) as DecomposedTask[]
                }
            } catch {
                // parse failed
            }
            setDecomposing(false)
            if (parsed && parsed.length > 0) {
                setTasks(parsed)
                // In brainstorm mode tasks are at step 4, in spec mode at step 3
                const { wizardMode: mode } = useRelayStore.getState()
                setWizardStep(mode === 'brainstorm' ? 4 : 3)
            } else {
                setError('Failed to parse tasks from AI response. Please try decomposing again.')
                // Stay on current step (PRD review) instead of advancing to empty task list
            }
        }
    }, [setWizardStep]))

    const generatePrd = useCallback(async (clarifications?: string) => {
        setError('')
        setAgentStatus('')
        setStreaming(true)
        setPrdMarkdown('')
        // Safety timeout: if 'done' event never arrives, cancel after 10 minutes
        // Stored in ref so the 'done' event listener can clear it
        if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current)
        safetyTimeoutRef.current = setTimeout(() => {
            safetyTimeoutRef.current = null
            setStreaming(false)
            setError('Specification generation timed out. Please try again.')
        }, 10 * 60 * 1000)
        try {
            // Append test preference so PRD prompt picks it up naturally
            const { includeTests: wantTests } = useRelayStore.getState()
            const enrichedDescription = wantTests
                ? featureDescription + '\n\n[Include unit tests as part of the implementation requirements and acceptance criteria.]'
                : featureDescription + '\n\n[Do NOT include unit tests, test files, or testing requirements in the specification or tasks.]'
            await window.relayAPI.generatePrd(
                activeProject?.id ?? '',
                enrichedDescription,
                clarifications,
                projectContext ?? undefined,
                featureAttachments.length > 0 ? featureAttachments : undefined,
            )
        } catch (err) {
            if (safetyTimeoutRef.current) { clearTimeout(safetyTimeoutRef.current); safetyTimeoutRef.current = null }
            setError(err instanceof Error ? err.message : 'Failed to generate specification')
            setStreaming(false)
        }
    }, [activeProject?.id, featureDescription, setPrdMarkdown, projectContext, featureAttachments])

    const [estimatedTaskCount, setEstimatedTaskCount] = useState(6)

    const decompose = useCallback(async () => {
        setError('')
        setAgentStatus('')
        setDecomposing(true)

        // Estimate task count from PRD structure for skeleton UI
        const headings = (prdMarkdown.match(/^#{2,3}\s+/gm) || []).length
        const bullets = (prdMarkdown.match(/^[-*]\s+/gm) || []).length
        const estimate = Math.max(4, Math.min(15, headings > 3 ? headings + Math.floor(bullets / 4) : Math.floor(bullets / 2) || 6))
        setEstimatedTaskCount(estimate)

        try {
            await window.relayAPI.decomposePrd(activeProject?.id ?? '', prdMarkdown, projectContext ?? undefined)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to decompose specification')
            setDecomposing(false)
        }
    }, [activeProject?.id, prdMarkdown, projectContext])

    const confirmTasks = useCallback(async () => {
        if (!activeProject) return
        // Validate: at least one task with a title
        const validTasks = tasks.filter(t => t.title.trim())
        if (validTasks.length === 0) {
            setError('Add at least one task with a title.')
            return
        }
        setSaving(true)
        setError('')
        try {
            // Determine feature title: user-provided name, or extract from PRD heading, or fallback
            let title = featureName.trim()
            if (!title && prdMarkdown) {
                const headingMatch = prdMarkdown.match(/^#\s+(?:PRD:\s*|Design:\s*)?(.+)/m)
                if (headingMatch) title = headingMatch[1].trim()
            }

            await window.relayAPI.savePrd({
                projectId: activeProject.id,
                description: featureDescription || (manualMode ? validTasks[0].title : ''),
                markdown: prdMarkdown || (manualMode ? `# ${featureDescription || 'Manual Feature'}\n\nManual tasks — no spec generated.` : ''),
                tasks: validTasks,
                title: title || undefined,
            })
            onComplete()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save')
            setSaving(false)
        }
    }, [activeProject, featureName, featureDescription, prdMarkdown, tasks, manualMode, onComplete])

    const handleManualMode = () => {
        setManualMode(true)
        setTasks([])
        setPrdMarkdown('')
        setWizardStep(3)
    }

    const startBrainstorm = useCallback(async () => {
        setError('')
        setWizardMode('brainstorm')
        setBrainstormStreaming(true)
        setWizardStep(1)

        // Add a placeholder assistant message that will be filled by streaming
        addBrainstormMessage({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
        })

        try {
            const result = await window.relayAPI.brainstormStart(
                activeProject?.id ?? '',
                featureDescription,
                projectContext ?? undefined,
                featureAttachments.length > 0 ? featureAttachments : undefined,
            )
            setBrainstormSessionId(result.sessionId)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to start brainstorming')
            setBrainstormStreaming(false)
            setWizardStep(0)
        }
    }, [activeProject?.id, featureDescription, projectContext, featureAttachments, setWizardMode, setWizardStep, addBrainstormMessage, setBrainstormSessionId])

    const respondBrainstorm = useCallback(async (message: string) => {
        if (!brainstormSessionId) return
        setError('')

        // Add user message
        addBrainstormMessage({
            id: crypto.randomUUID(),
            role: 'user',
            content: message,
            timestamp: Date.now(),
        })

        // Add placeholder for AI response (will be filled by brainstorm:message listener)
        addBrainstormMessage({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
        })

        // Thinking state is set by the brainstorm:message listener, but set eagerly for immediate UI feedback
        setBrainstormStreaming(true)

        try {
            await window.relayAPI.brainstormRespond(brainstormSessionId, message)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to get response')
            setBrainstormStreaming(false)
        }
    }, [brainstormSessionId, addBrainstormMessage])

    const finalizeBrainstorm = useCallback(async () => {
        if (!brainstormSessionId) return
        setError('')
        setBrainstormFinalizing(true)
        setPrdMarkdown('')

        try {
            await window.relayAPI.brainstormFinalize(brainstormSessionId)
            setBrainstormSessionId(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to finalize design')
            setBrainstormFinalizing(false)
        }
    }, [brainstormSessionId, setBrainstormSessionId, setPrdMarkdown])

    const addTask = (task: DecomposedTask) => {
        const num = tasks.length + 1
        setTasks(prev => [...prev, {
            ...task,
            storyId: task.storyId || `TASK-${String(num).padStart(3, '0')}`,
        }])
    }

    const removeTasks = (index: number) => {
        setTasks((prev) => prev.filter((_, i) => i !== index))
    }

    const updateTask = (index: number, updated: DecomposedTask) => {
        setTasks((prev) => prev.map((t, i) => i === index ? updated : t))
    }

    const isBrainstorm = wizardMode === 'brainstorm'
    const effectiveStep = streaming ? 1 : decomposing ? (isBrainstorm ? 4 : 3) : wizardStep

    const handleBack = () => {
        // Don't allow back while streaming/decomposing/brainstorming
        if (streaming || decomposing || brainstormStreaming || brainstormFinalizing) return

        if (wizardStep === 0) {
            // First step — exit wizard entirely
            onBack()
        } else if (manualMode && wizardStep === 3) {
            // Manual mode tasks → back to describe
            setManualMode(false)
            setTasks([])
            setFeaturePhase('describe')
            setWizardStep(0)
        } else if (isBrainstorm && wizardStep === 1) {
            // Brainstorm chat → back to describe
            clearBrainstormState()
            if (brainstormSessionId) {
                window.relayAPI.brainstormCleanup(brainstormSessionId)
            }
            setFeaturePhase('describe')
            setWizardStep(0)
        } else if (isBrainstorm && wizardStep === 2) {
            // Review Design → back to Brainstorm chat (can't go back, design is finalized)
            // Go back to describe instead since session is cleaned up
            clearBrainstormState()
            setPrdMarkdown('')
            setFeaturePhase('describe')
            setWizardStep(0)
        } else if (isBrainstorm && wizardStep === 3) {
            // Edit → back to Review Design
            setWizardStep(2)
        } else if (isBrainstorm && wizardStep === 4) {
            // Tasks → back to Review Design
            setWizardStep(2)
        } else if (wizardStep === 2) {
            // Edit → back to Review PRD
            setWizardStep(1)
        } else if (wizardStep === 3) {
            // Tasks → back to Review PRD
            setWizardStep(1)
        } else {
            // Review PRD → back to Describe (keep description intact)
            setFeaturePhase('describe')
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
                        disabled={streaming || decomposing || brainstormStreaming || brainstormFinalizing}
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
                    <StepIndicator
                        steps={manualMode ? MANUAL_STEPS : isBrainstorm ? BRAINSTORM_STEPS : PRD_STEPS}
                        currentStep={manualMode ? (wizardStep === 0 ? 0 : 1) : effectiveStep}
                    />
                </div>

                {/* Feature description context */}
                {featureDescription && effectiveStep > 0 && (
                    <div className="px-5 pb-5 mt-auto">
                        <div className="border-t border-border pt-4">
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">
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
                    (isBrainstorm ? effectiveStep === 4 : effectiveStep === 3) || decomposing ? 'max-w-6xl'
                    : (isBrainstorm ? [1, 2, 3].includes(effectiveStep) : [1, 2].includes(effectiveStep)) ? 'max-w-5xl'
                    : 'max-w-3xl'
                }`}>
                    {/* Step title */}
                    <div className="mb-8">
                        <h1 className="text-lg font-semibold text-foreground">
                            {effectiveStep === 0 && (featurePhase === 'answering' ? 'A few questions to refine the specification' : 'Describe your feature')}
                            {effectiveStep === 1 && !isBrainstorm && (streaming ? 'Generating feature specification document...' : 'Review your feature specification')}
                            {effectiveStep === 1 && isBrainstorm && 'Brainstorm your feature'}
                            {effectiveStep === 2 && !isBrainstorm && 'Edit specification'}
                            {effectiveStep === 2 && isBrainstorm && (brainstormFinalizing ? 'Generating design document...' : 'Review your design')}
                            {effectiveStep === 3 && !isBrainstorm && (decomposing ? 'Decomposing into tasks...' : manualMode ? 'Add your tasks' : 'Review tasks')}
                            {effectiveStep === 3 && isBrainstorm && 'Edit design'}
                            {effectiveStep === 4 && isBrainstorm && (decomposing ? 'Decomposing into tasks...' : 'Review tasks')}
                            {effectiveStep === 4 && !isBrainstorm && 'Confirm'}
                            {effectiveStep === 5 && isBrainstorm && 'Confirm'}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            {effectiveStep === 0 && (featurePhase === 'answering' ? 'Answer what you can — skip the rest and we\'ll make reasonable assumptions.' : 'What are you building? Be as detailed as you like.')}
                            {effectiveStep === 1 && !isBrainstorm && (streaming ? 'Claude is writing your feature specification document.' : 'Make sure this captures what you want to build.')}
                            {effectiveStep === 1 && isBrainstorm && 'Have a conversation to explore your idea. Click Finalize Design when ready.'}
                            {effectiveStep === 2 && !isBrainstorm && 'Refine the markdown directly, then save.'}
                            {effectiveStep === 2 && isBrainstorm && (brainstormFinalizing ? 'Claude is writing the design document from your conversation.' : 'Make sure this captures what you discussed.')}
                            {effectiveStep === 3 && !isBrainstorm && (decomposing ? 'Breaking the specification into buildable tasks.' : manualMode ? 'Define the tasks you want the agent to build.' : 'Remove any tasks that aren\'t needed, then start building.')}
                            {effectiveStep === 3 && isBrainstorm && 'Refine the markdown directly, then save.'}
                            {effectiveStep === 4 && isBrainstorm && (decomposing ? 'Breaking the design into buildable tasks.' : 'Remove any tasks that aren\'t needed, then start building.')}
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
                                featureName={featureName}
                                onFeatureNameChange={setFeatureName}
                                includeTests={includeTests}
                                onIncludeTestsChange={setIncludeTests}
                                onGenerate={generatePrd}
                                onBrainstorm={startBrainstorm}
                                onManualMode={handleManualMode}
                                loading={streaming}
                                projectId={activeProject?.id}
                                projectContext={projectContext}
                                scanningProject={scanningProject}
                                attachments={featureAttachments}
                                onAddAttachment={addFeatureAttachment}
                                onRemoveAttachment={removeFeatureAttachment}
                                onPhaseChange={setFeaturePhase}
                            />
                        )}

                        {/* Brainstorm chat (step 1 in brainstorm mode) */}
                        {isBrainstorm && wizardStep === 1 && (
                            <BrainstormChat
                                messages={brainstormMessages}
                                streaming={brainstormStreaming}
                                finalizing={brainstormFinalizing}
                                onSend={respondBrainstorm}
                                onFinalize={finalizeBrainstorm}
                                projectId={activeProject?.id}
                            />
                        )}

                        {/* PRD Review (step 1 in spec mode, step 2 in brainstorm mode) */}
                        {((wizardStep === 1 && !isBrainstorm) || streaming || (isBrainstorm && wizardStep === 2)) && !decomposing && !(isBrainstorm && wizardStep === 1) && (
                            <PRDPreview
                                markdown={prdMarkdown}
                                streaming={streaming || brainstormFinalizing}
                                agentStatus={agentStatus}
                                onEdit={() => setWizardStep(isBrainstorm ? 3 : 2)}
                                onApprove={decompose}
                            />
                        )}

                        {/* Edit (step 2 in spec mode, step 3 in brainstorm mode) */}
                        {((wizardStep === 2 && !isBrainstorm) || (wizardStep === 3 && isBrainstorm && !decomposing)) && (
                            <PRDEditor
                                markdown={prdMarkdown}
                                onChange={setPrdMarkdown}
                                onSave={() => setWizardStep(isBrainstorm ? 2 : 1)}
                            />
                        )}

                        {/* Tasks (step 3 in spec mode, step 4 in brainstorm mode) */}
                        {((!isBrainstorm && (wizardStep === 3 || decomposing)) || (isBrainstorm && (wizardStep === 4 || decomposing) && wizardStep !== 3)) && (
                            decomposing ? (
                                <div className="space-y-6">
                                    <div className="flex flex-col items-center gap-2 py-4">
                                        <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                        <p className="text-sm text-muted-foreground">
                                            {agentStatus
                                                ? agentStatus.replace(/PRD/gi, 'specification')
                                                : 'Analyzing specification and creating tasks...'}
                                        </p>
                                    </div>
                                    <div className="flex gap-5 items-start">
                                        {(() => {
                                            // Distribute estimated tasks across priority columns (capped to avoid scroll)
                                            const total = estimatedTaskCount
                                            const highCount = Math.min(4, Math.max(1, Math.round(total * 0.3)))
                                            const lowCount = Math.min(3, Math.max(1, Math.round(total * 0.15)))
                                            const medCount = Math.min(3, Math.max(1, total - highCount - lowCount))
                                            return [
                                                { label: 'High Priority', count: highCount },
                                                { label: 'Medium Priority', count: medCount },
                                                { label: 'Low Priority', count: lowCount },
                                            ].filter(col => col.count > 0)
                                        })().map(({ label, count }) => (
                                            <div key={label} className="flex-1 min-w-0 flex flex-col">
                                                <div className="flex items-center gap-2 mb-3 px-1">
                                                    <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                                                </div>
                                                <div className="space-y-2">
                                                    {Array.from({ length: count }).map((_, i) => (
                                                        <div key={i} className="p-3 rounded-lg border border-border bg-card space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                <div className="h-3 w-12 bg-muted rounded animate-pulse" />
                                                                <div className="h-3 w-16 bg-muted rounded animate-pulse" />
                                                            </div>
                                                            <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
                                                            <div className="h-3 w-full bg-muted/60 rounded animate-pulse" />
                                                            <div className="h-3 w-2/3 bg-muted/60 rounded animate-pulse" />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <TaskReview
                                    tasks={tasks}
                                    onRemove={removeTasks}
                                    onUpdate={updateTask}
                                    onConfirm={confirmTasks}
                                    onAddTask={addTask}
                                    loading={saving}
                                    manualMode={manualMode}
                                />
                            )
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}
