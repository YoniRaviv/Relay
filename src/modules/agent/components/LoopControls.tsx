import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Play, Pause, Square, ChevronDown, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useRelayStore } from '@/store/useRelayStore'
import { UncommittedChangesDialog } from './UncommittedChangesDialog'
import { BranchSetupDialog } from './BranchSetupDialog'
import { useClickOutside } from '@/shared/hooks/useClickOutside'
import type { FileChange } from '@/shared/types/review'
import type { BuildMode } from '@shared/types'

export function LoopControls() {
    const { loopState, setLoopState, activeProject, clearActivity, setFeatureBranch, setBaseBranch, setCurrentBranch, buildMode, setBuildMode } = useRelayStore()
    const [showUncommitted, setShowUncommitted] = useState(false)
    const [showBranchSetup, setShowBranchSetup] = useState(false)
    const [dirtyFiles, setDirtyFiles] = useState<FileChange[]>([])

    const startLoopDirectly = async () => {
        if (!activeProject) return
        clearActivity()
        setLoopState('running')
        try {
            const { activePrdId: prdId, buildMode: currentBuildMode } = useRelayStore.getState()
            await window.relayAPI.startLoop(activeProject.id, prdId ?? undefined, currentBuildMode)
        } catch (err) {
            setLoopState('stopped')
            const msg = err instanceof Error ? err.message : 'Failed to start loop'
            if (msg.includes('401') || msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('key')) {
                toast.error('Invalid API key', { description: 'Check your API key in Settings.' })
            } else if (msg.includes('429') || msg.toLowerCase().includes('rate')) {
                toast.error('Rate limited', { description: 'Too many requests. Try again shortly.' })
            } else {
                toast.error('Agent error', { description: msg })
            }
        }
    }

    const handleStart = async () => {
        if (!activeProject) return

        // Check for uncommitted changes first
        try {
            const status = await window.relayAPI.gitStatus(activeProject.id)
            if (!status.clean) {
                setDirtyFiles(status.files)
                setShowUncommitted(true)
                return
            }
        } catch {
            // If git status fails (e.g. not a git repo), skip the check
        }

        // Check if we're already on a feature branch (not a base branch)
        // If so, skip branch setup — the branch was created in a previous session
        try {
            const baseBranches = ['main', 'master', 'develop']
            const branchInfo = await window.relayAPI.gitBranch(activeProject.id)
            const currentBranch = branchInfo.current

            if (currentBranch && !baseBranches.includes(currentBranch)) {
                // Already on a feature branch — restore state and start directly
                setFeatureBranch(currentBranch)
                setCurrentBranch(currentBranch)
                await startLoopDirectly()
                return
            }
        } catch {
            // If git branch check fails, fall through to branch setup
        }

        // No feature branch — show branch setup dialog
        setShowBranchSetup(true)
    }

    const handleStash = async () => {
        if (!activeProject) return
        await window.relayAPI.gitStash(activeProject.id)
        toast.success('Changes stashed')
        setShowUncommitted(false)
        setShowBranchSetup(true)
    }

    const handleCommitExisting = async (message: string) => {
        if (!activeProject) return
        await window.relayAPI.gitCommit(activeProject.id, message)
        toast.success('Changes committed')
        setShowUncommitted(false)
        setShowBranchSetup(true)
    }

    const handleBranchConfirm = async (branchName: string, baseBranch: string) => {
        if (!activeProject) return

        // Create the feature branch
        await window.relayAPI.gitCreateBranch(activeProject.id, branchName, baseBranch)
        setFeatureBranch(branchName)
        setBaseBranch(baseBranch)
        setCurrentBranch(branchName)
        setShowBranchSetup(false)

        // Now start the loop
        await startLoopDirectly()
    }

    const handlePause = async () => {
        setLoopState('paused')
        await window.relayAPI.pauseLoop()
    }

    const handleResume = async () => {
        setLoopState('running')
        try {
            await window.relayAPI.resumeLoop()
        } catch (err) {
            setLoopState('paused')
            toast.error('Failed to resume', { description: err instanceof Error ? err.message : 'Unknown error' })
        }
    }

    const handleStop = async () => {
        setLoopState('stopped')
        await window.relayAPI.stopLoop()
    }

    const [modeOpen, setModeOpen] = useState(false)
    const modeRef = useRef<HTMLDivElement>(null)
    useClickOutside(modeRef, useCallback(() => setModeOpen(false), []), modeOpen)

    const buildModeOptions: { mode: BuildMode; label: string; description: string }[] = [
        { mode: 'review', label: 'Pause for Review', description: 'Pauses after each task for you to approve or reject' },
        { mode: 'auto-commit', label: 'Auto-Commit', description: 'Commits each task automatically and continues' },
        { mode: 'continuous', label: 'Continuous', description: 'Builds all tasks, leaves changes for batch review' },
    ]

    const currentModeOption = buildModeOptions.find(o => o.mode === buildMode) ?? buildModeOptions[0]

    const stateLabel: Record<string, string> = {
        idle: 'Idle',
        running: 'Running',
        paused: 'Paused',
        stopped: 'Stopped',
    }

    const stateColor: Record<string, string> = {
        idle: 'bg-stone-400',
        running: 'bg-emerald-500 animate-pulse',
        paused: 'bg-amber-500',
        stopped: 'bg-rose-500',
    }

    return (
        <>
            <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${stateColor[loopState]}`} />
                <span className="text-xs text-muted-foreground">{stateLabel[loopState]}</span>

                {loopState === 'idle' || loopState === 'stopped' ? (
                    <>
                        <div ref={modeRef} className="relative">
                            <button
                                onClick={() => setModeOpen(!modeOpen)}
                                className="h-7 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground shadow-sm cursor-pointer flex items-center gap-1.5 hover:bg-accent/50 transition-colors"
                            >
                                {currentModeOption.label}
                                <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${modeOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {modeOpen && (
                                <div className="absolute top-full right-0 mt-1 w-72 rounded-lg bg-card border border-border shadow-xl z-50 overflow-hidden">
                                    {buildModeOptions.map(({ mode, label, description }) => (
                                        <button
                                            key={mode}
                                            onClick={() => { setBuildMode(mode); setModeOpen(false) }}
                                            className={`flex items-start gap-2.5 w-full px-3 py-2.5 text-left transition-colors ${
                                                buildMode === mode ? 'bg-accent/60' : 'hover:bg-accent/30'
                                            }`}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium">{label}</p>
                                                <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
                                            </div>
                                            {buildMode === mode && (
                                                <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={handleStart}>
                            <Play className="h-3.5 w-3.5" />
                            Start
                        </Button>
                    </>
                ) : loopState === 'running' ? (
                    <>
                        <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={handlePause}>
                            <Pause className="h-3.5 w-3.5" />
                            Pause
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={handleStop}>
                            <Square className="h-3.5 w-3.5" />
                            Stop
                        </Button>
                    </>
                ) : loopState === 'paused' ? (
                    <>
                        <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={handleResume}>
                            <Play className="h-3.5 w-3.5" />
                            Resume
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={handleStop}>
                            <Square className="h-3.5 w-3.5" />
                            Stop
                        </Button>
                    </>
                ) : null}
            </div>

            {showUncommitted && (
                <UncommittedChangesDialog
                    files={dirtyFiles}
                    onStash={handleStash}
                    onCommit={handleCommitExisting}
                    onCancel={() => setShowUncommitted(false)}
                />
            )}

            {showBranchSetup && (
                <BranchSetupDialog
                    onConfirm={handleBranchConfirm}
                    onCancel={() => setShowBranchSetup(false)}
                />
            )}
        </>
    )
}
