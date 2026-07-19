import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, BookOpen, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Playbook, PlaybookStep } from '@/shared/types/scheduler'
import type { OutputType } from '@/shared/types/scheduler'
import { MODEL_OPTIONS, OUTPUT_TYPES } from '../utils/options'

interface PlaybookModalProps {
    playbook: Playbook | null
    onClose: () => void
    onSaved: () => Promise<void> | void
}

interface StepDraft {
    name: string
    prompt: string
}

const fieldClass =
    'w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring'

/** Create or edit a playbook: single prompt, or ordered steps (a chain). */
export function PlaybookModal({ playbook, onClose, onSaved }: PlaybookModalProps) {
    const [name, setName] = useState(playbook?.name ?? '')
    const [multiStep, setMultiStep] = useState((playbook?.steps?.length ?? 0) > 0)
    const [prompt, setPrompt] = useState(playbook?.prompt ?? '')
    const [steps, setSteps] = useState<StepDraft[]>(
        playbook?.steps?.map((s) => ({ name: s.name, prompt: s.prompt })) ?? [{ name: '', prompt: '' }],
    )
    const [model, setModel] = useState(playbook?.model ?? '')
    const [outputType, setOutputType] = useState<OutputType>(playbook?.outputType ?? 'md')
    const [skill, setSkill] = useState(playbook?.skill ?? '')
    const [saving, setSaving] = useState(false)

    const stepsValid = steps.length > 0 && steps.every((s) => s.name.trim() && s.prompt.trim())
    const canSave = name.trim().length > 0 && (multiStep ? stepsValid : prompt.trim().length > 0) && !saving

    const patchStep = (i: number, patch: Partial<StepDraft>) =>
        setSteps((all) => all.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

    const handleSave = async () => {
        if (!canSave) return
        setSaving(true)
        try {
            const payload = {
                name: name.trim(),
                prompt: multiStep ? null : prompt.trim(),
                steps: multiStep
                    ? steps.map((s): PlaybookStep => ({ name: s.name.trim(), prompt: s.prompt, skill: null, model: null, outputType: null }))
                    : null,
                model: model || null,
                skill: skill.trim() || null,
                outputType,
            }
            if (playbook) await window.relayAPI.scheduler.playbooks.update(playbook.id, payload)
            else await window.relayAPI.scheduler.playbooks.create(payload)
            await onSaved()
        } finally {
            setSaving(false)
        }
    }

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-xl mx-4 max-h-[85vh] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-[var(--color-sidebar)]">
                    <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-muted-foreground" />
                        <h3 className="font-semibold text-sm">{playbook ? 'Edit Playbook' : 'New Playbook'}</h3>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto min-h-0">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</label>
                        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Researcher" className={fieldClass} autoFocus />
                    </div>

                    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={multiStep}
                            onChange={(e) => setMultiStep(e.target.checked)}
                            className="h-4 w-4 rounded border-border accent-primary"
                        />
                        <span>Multi-step (chain)</span>
                        <span className="text-xs text-muted-foreground">(each step runs after the previous one finishes)</span>
                    </label>

                    {!multiStep ? (
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prompt</label>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="Research the topic in the job instructions…"
                                className={`${fieldClass} h-24 resize-none`}
                            />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Steps</label>
                            {steps.map((s, i) => (
                                <div key={i} className="p-3 rounded-md border border-border/60 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-mono text-muted-foreground shrink-0">{i + 1}.</span>
                                        <input
                                            value={s.name}
                                            onChange={(e) => patchStep(i, { name: e.target.value })}
                                            placeholder="Step name"
                                            className={fieldClass}
                                        />
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 w-7 p-0 shrink-0 text-destructive hover:text-destructive"
                                            disabled={steps.length <= 1}
                                            onClick={() => setSteps((all) => all.filter((_, idx) => idx !== i))}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                    <textarea
                                        value={s.prompt}
                                        onChange={(e) => patchStep(i, { prompt: e.target.value })}
                                        placeholder="What this step should do"
                                        className={`${fieldClass} h-16 resize-none`}
                                    />
                                </div>
                            ))}
                            <Button size="sm" variant="outline" className="text-[12px]" onClick={() => setSteps((all) => [...all, { name: '', prompt: '' }])}>
                                <Plus className="h-3 w-3 mr-1" />
                                Add step
                            </Button>
                        </div>
                    )}

                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Model</label>
                            <select value={model} onChange={(e) => setModel(e.target.value)} className={fieldClass}>
                                {MODEL_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Output</label>
                            <select value={outputType} onChange={(e) => setOutputType(e.target.value as OutputType)} className={fieldClass}>
                                {OUTPUT_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Skill</label>
                            <input value={skill} onChange={(e) => setSkill(e.target.value)} placeholder="(optional)" className={fieldClass} />
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
                    <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
                    <Button size="sm" onClick={handleSave} disabled={!canSave}>{playbook ? 'Save' : 'Create'}</Button>
                </div>
            </div>
        </div>,
        document.body,
    )
}
