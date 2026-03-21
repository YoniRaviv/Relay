import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Sparkles, ChevronDown, Check } from 'lucide-react'
import { AVAILABLE_MODELS } from '@shared/pricing'
import { tierColors } from '@/shared/constants/statusMaps'
import { useClickOutside } from '@/shared/hooks/useClickOutside'
import type { EngineMode } from '@shared/types'

export function ModelPicker() {
    const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-20250514')
    const [engineMode, setEngineMode] = useState<EngineMode>('claude-code')
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        window.relayAPI.getSelectedModel().then(setSelectedModel)
        window.relayAPI.getEngineMode().then(setEngineMode)
    }, [])

    const filteredModels = useMemo(() => {
        return AVAILABLE_MODELS.filter(m => {
            if (engineMode === 'codex') return m.engine === 'openai'
            return m.engine === 'anthropic' || !m.engine
        })
    }, [engineMode])

    useClickOutside(ref, useCallback(() => setOpen(false), []), open)

    const handleSelect = async (modelId: string) => {
        setSelectedModel(modelId)
        setOpen(false)
        await window.relayAPI.setSelectedModel(modelId)
    }

    const current = AVAILABLE_MODELS.find((m) => m.id === selectedModel)

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/60 border border-border hover:bg-accent/50 transition-colors"
            >
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">
                    {current?.label ?? 'Model'}
                </span>
                <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute top-full right-0 mt-1 w-64 rounded-lg bg-card border border-border shadow-xl z-50 overflow-hidden">
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
    )
}
