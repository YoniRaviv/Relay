import { useState } from 'react'
import { Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useIpcListener } from '@/shared/hooks/useIpcListener'

interface ReviewFixingStateProps {
    progress: string
    onCancel: () => void
}

export function ReviewFixingState({ progress, onCancel }: ReviewFixingStateProps) {
    const [fileLog, setFileLog] = useState<Array<{ file: string; action: string }>>([])

    useIpcListener('reviewAgent:fixProgress', (data: unknown) => {
        const entry = data as { file: string; action: string }
        setFileLog(prev => {
            const exists = prev.some(e => e.file === entry.file && e.action === entry.action)
            if (exists) return prev
            return [...prev, entry]
        })
    })

    return (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6">
            {/* Hammer animation */}
            <div className="relative">
                <div className="rounded-full bg-muted p-5">
                    <Wrench
                        className="h-10 w-10 text-primary"
                        style={{
                            animation: 'hammer 0.6s ease-in-out infinite',
                            transformOrigin: 'bottom right',
                        }}
                    />
                </div>
                <style>{`
                    @keyframes hammer {
                        0%, 100% { transform: rotate(0deg); }
                        50% { transform: rotate(-20deg); }
                    }
                `}</style>
            </div>

            <div className="text-center">
                <h3 className="text-[15px] font-semibold mb-1">Applying Fixes</h3>
                <p className="text-[13px] text-muted-foreground">{progress || 'Working...'}</p>
            </div>

            {/* File activity log */}
            {fileLog.length > 0 && (
                <div className="w-full max-w-sm rounded-lg bg-muted/30 border border-border/50 p-3 max-h-40 overflow-auto">
                    <div className="space-y-1">
                        {fileLog.map((entry, i) => (
                            <div key={i} className="flex items-center gap-2 text-[11px]">
                                <span className={`shrink-0 ${
                                    entry.action === 'reading' ? 'text-blue-400' : 'text-emerald-400'
                                }`}>
                                    {entry.action === 'reading' ? '○' : '●'}
                                </span>
                                <span className="text-muted-foreground truncate">{entry.file}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
    )
}
