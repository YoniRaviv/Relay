import { useState, useEffect, useCallback } from 'react'
import { Square, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRelayStore } from '@/store/useRelayStore'

interface RunCommand {
    command: string
    args: string[]
    label: string
}

interface RunProjectButtonProps {
    onRun?: () => void
}

export function RunProjectButton({ onRun }: RunProjectButtonProps) {
    const activeProject = useRelayStore((s) => s.activeProject)
    const [running, setRunning] = useState(false)
    const [detected, setDetected] = useState<RunCommand | null>(null)

    useEffect(() => {
        if (!activeProject) return
        window.relayAPI.detectRunCommand(activeProject.id).then(setDetected).catch(() => {})
        window.relayAPI.isProjectRunning().then(setRunning).catch(() => {})
    }, [activeProject])

    const handleToggle = useCallback(async () => {
        if (!activeProject) return
        if (running) {
            await window.relayAPI.stopProject()
            setRunning(false)
        } else {
            try {
                await window.relayAPI.runProject(activeProject.id)
                setRunning(true)
                onRun?.()
            } catch {
                // No run command detected or failed
            }
        }
    }, [activeProject, running, onRun])

    useEffect(() => {
        const cleanup = window.relayAPI.on('project:processExit', () => {
            setRunning(false)
        })
        return cleanup
    }, [])

    if (!detected && !running) return null

    return (
        <Button
            size="sm"
            variant="outline"
            className={`h-7 gap-1.5 ${running ? 'text-destructive hover:text-destructive' : ''}`}
            onClick={handleToggle}
            title={detected?.label || 'Run project'}
        >
            {running ? (
                <>
                    <Square className="h-3 w-3" />
                    Stop
                </>
            ) : (
                <>
                    <Terminal className="h-3 w-3" />
                    Run
                </>
            )}
        </Button>
    )
}
