import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StepIndicator } from '@/components/StepIndicator'
import { FeatureInput } from '@/components/FeatureInput'
import { PRDPreview } from '@/components/PRDPreview'
import { PRDEditor } from '@/components/PRDEditor'
import { TaskReview } from '@/components/TaskReview'
import { useRelayStore } from '@/store/useRelayStore'

const STEPS = ['Describe', 'Review PRD', 'Edit', 'Tasks', 'Confirm']

interface DecomposedTask {
  storyId: string
  title: string
  description: string
  acceptanceCriteria: string
  priority: 'high' | 'medium' | 'low'
}

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

  // Listen for PRD stream events
  useEffect(() => {
    const removePrdStream = window.relayAPI.on('prd:stream', (data: unknown) => {
      const event = data as { type: string; text: string }
      if (event.type === 'delta') {
        setPrdMarkdown((prev: string) => prev + event.text)
      }
      if (event.type === 'done') {
        setStreaming(false)
        setWizardStep(1)
      }
    })

    const removeDecomposeStream = window.relayAPI.on('prd:decomposeStream', (data: unknown) => {
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
    })

    return () => {
      removePrdStream()
      removeDecomposeStream()
    }
  }, [setPrdMarkdown, setWizardStep])

  const generatePrd = useCallback(async () => {
    setError('')
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

          {(wizardStep === 1 || streaming) && (
            <PRDPreview
              markdown={prdMarkdown}
              streaming={streaming}
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
                <p className="text-sm text-muted-foreground">Decomposing PRD into tasks...</p>
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
