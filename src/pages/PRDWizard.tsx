import { useState, useCallback } from 'react'
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

    // Listen for PRD stream events
    useIpcListener('prd:stream', useCallback((data: unknown) => {
        const event = data as { type: string; text: string }
        if (event.type === 'delta') {
            setPrdMarkdown((prev: string) => prev + event.text)
        }
        if (event.type === 'done') {
            setStreaming(false)
            setWizardStep(1)
        }
    }, [setPrdMarkdown, setWizardStep]))

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

    const generatePrd = useCallback(async () => {
        setError('')
        setAgentStatus('')
        setStreaming(true)
        setPrdMarkdown('')
        try {
            await window.relayAPI.generatePrd(featureDescription)
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
            await window.relayAPI.decomposePrd(prdMarkdown)
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

    return (
        <div className="flex items-center justify-center min-h-screen p-4">
            <Card className="w-[640px]">
                <CardHeader className="text-center relative">
                    <button
                        onClick={onBack}
                        className="absolute left-6 top-6 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        &larr; Back
                    </button>
                    <CardTitle className="text-xl">PRD Wizard</CardTitle>
                </CardHeader>
                <CardContent>
                    <StepIndicator steps={STEPS} currentStep={effectiveStep} />

                    {error && (
                        <p className="text-sm text-destructive mb-4 text-center">{error}</p>
                    )}

                    {wizardStep === 0 && !streaming && (
                        <FeatureInput
                            value={featureDescription}
                            onChange={setFeatureDescription}
                            onSubmit={generatePrd}
                            loading={streaming}
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
                </CardContent>
            </Card>
        </div>
    )
}
