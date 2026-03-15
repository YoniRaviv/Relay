import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ProjectSelector } from '@/modules/project'
import {
    Cpu, Terminal, CheckCircle, XCircle, Loader2, ArrowLeft,
} from 'lucide-react'
import type { Project, EngineMode } from '@shared/types'

interface SetupProps {
    initialStep?: number
    onComplete: (project: Project) => void
}

export function Setup({ initialStep = 0, onComplete }: SetupProps) {
    const [step, setStep] = useState(initialStep)

    const stepLabels = ['Engine', 'Configure', 'Project']

    const goBack = () => {
        if (step > 0) setStep(step - 1)
    }

    return (
        <div className="flex items-center justify-center min-h-screen p-4">
            <Card className="w-[520px]">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl">Relay</CardTitle>
                    <CardDescription>
                        {step === 0 && 'Choose how Relay connects to Claude'}
                        {step === 1 && 'Configure your connection'}
                        {step === 2 && 'Select or create a project'}
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    {/* Step indicator */}
                    <div className="flex items-center justify-center gap-2 mb-6">
                        {stepLabels.map((label, i) => (
                            <div key={label} className="flex items-center gap-2">
                                {i > 0 && (
                                    <div className={`h-px w-6 ${step > i - 1 ? 'bg-primary' : 'bg-border'}`} />
                                )}
                                <StepDot active={step === i} complete={step > i} label={`${i + 1}`} />
                            </div>
                        ))}
                    </div>

                    {step === 0 && (
                        <EngineChoice onSelect={(mode) => {
                            window.relayAPI.setEngineMode(mode)
                            setStep(1)
                        }} />
                    )}
                    {step === 1 && (
                        <EngineSetup onVerified={() => setStep(2)} onBack={goBack} />
                    )}
                    {step === 2 && (
                        <div className="space-y-4">
                            <ProjectSelector onProjectSelected={onComplete} />
                            {initialStep < 2 && (
                                <button
                                    onClick={goBack}
                                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <ArrowLeft className="h-3 w-3" />
                                    Back
                                </button>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

function EngineChoice({ onSelect }: { onSelect: (mode: EngineMode) => void }) {
    return (
        <div className="space-y-3">
            <EngineCard
                icon={<Terminal className="h-5 w-5" />}
                title="Claude Code CLI"
                description="Uses your existing Claude Code installation and authentication. Recommended if you already have Claude Code set up."
                tag="Recommended"
                onClick={() => onSelect('claude-code')}
            />
            <EngineCard
                icon={<Cpu className="h-5 w-5" />}
                title="Anthropic API Key"
                description="Connect directly with your Anthropic API key. You pay per token based on usage."
                onClick={() => onSelect('api-key')}
            />
            <p className="text-xs text-muted-foreground text-center pt-2">
                You can change this later in Settings.
            </p>
        </div>
    )
}

function EngineCard({
    icon, title, description, tag, onClick,
}: {
    icon: React.ReactNode
    title: string
    description: string
    tag?: string
    onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            className="w-full flex items-start gap-4 p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-accent/40 transition-all text-left group"
        >
            <div className="shrink-0 mt-0.5 text-muted-foreground group-hover:text-foreground transition-colors">
                {icon}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{title}</p>
                    {tag && (
                        <span className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                            {tag}
                        </span>
                    )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
            </div>
        </button>
    )
}

function EngineSetup({ onVerified, onBack }: { onVerified: () => void; onBack: () => void }) {
    const [engineMode, setEngineMode] = useState<EngineMode | null>(null)

    useEffect(() => {
        window.relayAPI.getEngineMode().then(setEngineMode)
    }, [])

    if (!engineMode) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return engineMode === 'claude-code'
        ? <CliSetup onVerified={onVerified} onBack={onBack} />
        : <ApiKeySetup onVerified={onVerified} onBack={onBack} />
}

function CliSetup({ onVerified, onBack }: { onVerified: () => void; onBack: () => void }) {
    const [status, setStatus] = useState<'checking' | 'found' | 'not-found'>('checking')
    const [cliPath, setCliPath] = useState<string | null>(null)
    const [error, setError] = useState('')

    useEffect(() => {
        checkCli()
    }, [])

    const checkCli = async () => {
        setStatus('checking')
        const result = await window.relayAPI.checkCliAvailable()
        if (result.available) {
            setStatus('found')
            setCliPath(result.path ?? null)
        } else {
            setStatus('not-found')
            setError(result.error ?? 'Claude Code CLI not found')
        }
    }

    return (
        <div className="space-y-4">
            <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center gap-3">
                    <Terminal className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1">
                        <p className="text-sm font-medium">Claude Code CLI</p>
                        <p className="text-xs text-muted-foreground">
                            {status === 'checking' && 'Checking installation...'}
                            {status === 'found' && (cliPath ? `Found at ${cliPath}` : 'Installed and ready')}
                            {status === 'not-found' && 'Not detected on this machine'}
                        </p>
                    </div>
                    <div className="shrink-0">
                        {status === 'checking' && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
                        {status === 'found' && <CheckCircle className="h-5 w-5 text-green-500" />}
                        {status === 'not-found' && <XCircle className="h-5 w-5 text-destructive" />}
                    </div>
                </div>

                {status === 'not-found' && (
                    <div className="rounded-md bg-destructive/10 p-3 space-y-2">
                        <p className="text-xs text-destructive font-medium">{error}</p>
                        <p className="text-xs text-muted-foreground">
                            Install Claude Code by running:
                        </p>
                        <code className="block text-xs font-mono bg-background/80 rounded px-2 py-1.5 select-all">
                            npm install -g @anthropic-ai/claude-code && claude login
                        </code>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between">
                <button
                    onClick={onBack}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="h-3 w-3" />
                    Back
                </button>
                <div className="flex items-center gap-2">
                    {status === 'not-found' && (
                        <Button variant="outline" size="sm" onClick={checkCli}>
                            Re-check
                        </Button>
                    )}
                    <Button
                        size="sm"
                        onClick={onVerified}
                        disabled={status !== 'found'}
                    >
                        Continue
                    </Button>
                </div>
            </div>
        </div>
    )
}

function ApiKeySetup({ onVerified, onBack }: { onVerified: () => void; onBack: () => void }) {
    const [key, setKey] = useState('')
    const [status, setStatus] = useState<'idle' | 'verifying' | 'valid' | 'invalid'>('idle')
    const [error, setError] = useState('')

    const verify = async () => {
        if (!key.trim()) return
        setStatus('verifying')
        setError('')

        const result = await window.relayAPI.setApiKey(key.trim())
        if (result.valid) {
            setStatus('valid')
            setTimeout(onVerified, 600)
        } else {
            setStatus('invalid')
            setError(result.error || 'Invalid API key')
        }
    }

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="apiKey">Anthropic API Key</Label>
                <div className="flex gap-2">
                    <Input
                        id="apiKey"
                        type="password"
                        placeholder="sk-ant-..."
                        value={key}
                        onChange={(e) => {
                            setKey(e.target.value)
                            setStatus('idle')
                            setError('')
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && verify()}
                        className="flex-1"
                    />
                    <Button onClick={verify} disabled={!key.trim() || status === 'verifying'}>
                        {status === 'verifying' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            'Verify'
                        )}
                    </Button>
                </div>
            </div>

            {status === 'valid' && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    API key verified
                </div>
            )}

            {status === 'invalid' && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                    <XCircle className="h-4 w-4" />
                    {error}
                </div>
            )}

            <p className="text-xs text-muted-foreground">
                Your key is encrypted and stored locally. It never leaves your machine except for API calls.
            </p>

            <div className="flex items-center justify-between pt-1">
                <button
                    onClick={onBack}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="h-3 w-3" />
                    Back
                </button>
            </div>
        </div>
    )
}

function StepDot({ active, complete, label }: { active: boolean; complete: boolean; label: string }) {
    const base = 'flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium transition-colors'
    if (complete) return <div className={`${base} bg-primary text-primary-foreground`}>{label}</div>
    if (active) return <div className={`${base} border-2 border-primary text-primary`}>{label}</div>
    return <div className={`${base} border border-border text-muted-foreground`}>{label}</div>
}
