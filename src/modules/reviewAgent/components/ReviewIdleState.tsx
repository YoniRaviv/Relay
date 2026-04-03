import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Search, ChevronDown } from 'lucide-react'
import { AVAILABLE_MODELS } from '@shared/pricing'
import { tierColors } from '@/shared/constants/statusMaps'
import type { EngineMode } from '@shared/types'

interface ReviewIdleStateProps {
    onStart: () => void
}

export function ReviewIdleState({ onStart }: ReviewIdleStateProps) {
    const [selectedModel, setSelectedModel] = useState('')
    const [engineMode, setEngineMode] = useState<EngineMode>('claude-code')

    useEffect(() => {
        window.relayAPI.getSelectedModel().then(setSelectedModel)
        window.relayAPI.getEngineMode().then(setEngineMode)
    }, [])

    const filteredModels = AVAILABLE_MODELS.filter(m => {
        if (engineMode === 'codex') return m.engine === 'openai'
        return m.engine === 'anthropic' || !m.engine
    })

    const current = AVAILABLE_MODELS.find(m => m.id === selectedModel)

    const handleModelChange = async (modelId: string) => {
        setSelectedModel(modelId)
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
                <div className="relative">
                    <select
                        value={selectedModel}
                        onChange={(e) => handleModelChange(e.target.value)}
                        className="appearance-none bg-muted/60 border border-border rounded-md pl-2.5 pr-7 py-1.5 text-xs font-medium text-foreground cursor-pointer hover:bg-accent/50 transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                        {filteredModels.map(m => (
                            <option key={m.id} value={m.id}>
                                {m.label} ({m.tier})
                            </option>
                        ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                </div>
                {current && (
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${tierColors[current.tier]}`}>
                        {current.costLabel}
                    </span>
                )}
            </div>

            <Button onClick={onStart} className="gap-2">
                <Search className="h-4 w-4" />
                Start Code Review
            </Button>
        </div>
    )
}
