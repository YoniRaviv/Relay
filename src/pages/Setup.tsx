import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ApiKeyInput } from '@/modules/settings'
import { ProjectSelector } from '@/modules/project'
import type { Project } from '@shared/types'

interface SetupProps {
    initialStep?: number
    onComplete: (project: Project) => void
}

export function Setup({ initialStep = 0, onComplete }: SetupProps) {
    const [step, setStep] = useState(initialStep)

    return (
        <div className="flex items-center justify-center min-h-screen p-4">
            <Card className="w-[460px]">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl">Relay</CardTitle>
                    <CardDescription>
                        {step === 0 ? 'Connect your Anthropic API key to get started' : 'Select or create a project'}
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    {/* Step indicator */}
                    <div className="flex items-center justify-center gap-2 mb-6">
                        <StepDot active={step === 0} complete={step > 0} label="1" />
                        <div className={`h-px w-8 ${step > 0 ? 'bg-primary' : 'bg-border'}`} />
                        <StepDot active={step === 1} complete={false} label="2" />
                    </div>

                    {step === 0 && <ApiKeyInput onVerified={() => setStep(1)} />}
                    {step === 1 && <ProjectSelector onProjectSelected={onComplete} />}
                </CardContent>
            </Card>
        </div>
    )
}

function StepDot({ active, complete, label }: { active: boolean; complete: boolean; label: string }) {
    const base = 'flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium transition-colors'
    if (complete) return <div className={`${base} bg-primary text-primary-foreground`}>{label}</div>
    if (active) return <div className={`${base} border-2 border-primary text-primary`}>{label}</div>
    return <div className={`${base} border border-border text-muted-foreground`}>{label}</div>
}
