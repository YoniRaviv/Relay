import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Search, ChevronDown, Check } from 'lucide-react'
import { AVAILABLE_MODELS } from '@shared/pricing'
import { tierColors } from '@/shared/constants/statusMaps'
import { useClickOutside } from '@/shared/hooks/useClickOutside'
import type { EngineMode } from '@shared/types'

interface ReviewIdleStateProps {
    onStart: () => void
}

export function ReviewIdleState({ onStart }: ReviewIdleStateProps) {
    const [selectedModel, setSelectedModel] = useState('')
    const [engineMode, setEngineMode] = useState<EngineMode>('claude-code')
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        window.relayAPI.getSelectedModel().then(setSelectedModel)
        window.relayAPI.getEngineMode().then(setEngineMode)
    }, [])

    useClickOutside(ref, useCallback(() => setOpen(false), []), open)

    const filteredModels = AVAILABLE_MODELS.filter(m => {
        if (engineMode === 'codex') return m.engine === 'openai'
        return m.engine === 'anthropic' || !m.engine
    })

    const current = AVAILABLE_MODELS.find(m => m.id === selectedModel)

    const handleSelect = async (modelId: string) => {
        setSelectedModel(modelId)
        setOpen(false)
        await window.relayAPI.setSelectedModel(modelId)
    }

    return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
            <div className="rounded-full bg-muted p-4">
                <Search className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
                <h3 className="text-lg font-semibold mb-1">Code Review</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                    Analyzes your feature changes for security issues, performance problems, race conditions, and convention violations.
                </p>
            </div>

            {/* Model selector */}
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <span>Model:</span>
                <div ref={ref} className="relative">
                    <button
                        onClick={() => setOpen(!open)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-muted/60 border border-border hover:bg-accent/50 transition-colors"
                    >
                        <span className="text-xs font-medium text-foreground">
                            {current?.label ?? 'Select model'}
                        </span>
                        {current && (
                            <span className={`text-[10px] font-semibold uppercase tracking-wide ${tierColors[current.tier]}`}>
                                {current.tier}
                            </span>
                        )}
                        <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>

                    {open && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-64 rounded-lg bg-card border border-border shadow-xl z-50 overflow-hidden">
                            <div className="px-3 py-2 border-b border-border">
                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Select Model
                                </span>
                            </div>
                            {filteredModels.map((m) => (
                                <button
                                    key={m.id}
                                    onClick={() => handleSelect(m.id)}
                                    className={`flex items-center gap-2.5 w-full px-3 py-2.5 text-left transition-colors ${
                                        selectedModel === m.id ? 'bg-accent/60' : 'hover:bg-accent/30'
                                    }`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium">{m.label}</span>
                                            <span className={`text-[10px] font-semibold uppercase tracking-wide ${tierColors[m.tier]}`}>
                                                {m.tier}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground mt-0.5">{m.costLabel}</p>
                                    </div>
                                    {selectedModel === m.id && (
                                        <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <Button onClick={onStart} className="gap-2">
                <Search className="h-4 w-4" />
                Start Code Review
            </Button>
        </div>
    )
}
