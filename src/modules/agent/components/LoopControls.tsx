import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Play, Pause, Square, ChevronDown, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useRelayStore } from '@/store/useRelayStore'
import { UncommittedChangesDialog } from './UncommittedChangesDialog'
import { BranchSetupDialog } from './BranchSetupDialog'
import { GitInitDialog } from './GitInitDialog'
import { PrCreationDialog } from '@/modules/review/components/PrCreationDialog'
import { FeatureCompleteActions } from './FeatureCompleteActions'
import { useClickOutside } from '@/shared/hooks/useClickOutside'
import type { FileChange } from '@/shared/types/review'
import type { BuildMode, LoopState } from '@shared/types'

interface LoopControlsProps {
    onArchiveFeature?: () => void
}

export function LoopControls({ onArchiveFeature }: LoopControlsProps = {}) {
    const { loopState, loopPrdId, setLoopState, setLoopPrdId, activeProject, clearActivity, setFeatureBranch, setBaseBranch, setCurrentBranch, buildMode, setBuildMode, tasks, prUrl, setPrUrl, activePrdId } = useRelayStore()
    const [showUncommitted, setShowUncommitted] = useState(false)
    const [showBranchSetup, setShowBranchSetup] = useState(false)
    const [showGitInit, setShowGitInit] = useState(false)
    const [dirtyFiles, setDirtyFiles] = useState<FileChange[]>([])
    const [hasRemote, setHasRemote] = useState<boolean | null>(null)
    const [prChecked, setPrChecked] = useState(false)

    // Show idle controls when viewing a different feature than the one the loop is running for
    const isLoopOnDifferentFeature = loopPrdId && activePrdId && loopPrdId !== activePrdId
    const effectiveLoopState: LoopState = isLoopOnDifferentFeature ? 'idle' : loopState

    const allComplete = useMemo(() => {
        return tasks.length > 0 && tasks.every(t => t.status === 'done')
    }, [tasks])

    const featureComplete = allComplete && effectiveLoopState !== 'running'

    // Check remote & PR status when feature completes
    useEffect(() => {
        if (!featureComplete || !activeProject) {
            setPrChecked(false)
            return
        }
        let cancelled = false
        const check = async () => {
            try {
                const { hasRemote: remote } = await window.relayAPI.gitHasRemote(activeProject.id)
                if (cancelled) return
                setHasRemote(remote)
                if (remote && !prUrl) {
                    const { url, state } = await window.relayAPI.gitGetPrUrl(activeProject.id)
                    if (cancelled) return
                    if (url) {
                        setPrUrl(url)
                        // If merged, we could mark the feature as done
                        if (state === 'merged') {
                            toast.success('PR was merged!')
                        }
                    }
                }
            } catch {
                if (!cancelled) setHasRemote(null)
            } finally {
                if (!cancelled) setPrChecked(true)
            }
        }
        check()
        return () => { cancelled = true }
    }, [featureComplete, activeProject]) // eslint-disable-line react-hooks/exhaustive-deps

    const startLoopDirectly = async () => {
        if (!activeProject) return
        clearActivity()
        setLoopState('running')
        try {
            const { activePrdId: prdId, buildMode: currentBuildMode } = useRelayStore.getState()
            setLoopPrdId(prdId)
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

    const checkBranchAndStart = async (): Promise<boolean> => {
        if (!activeProject) return false

        // Check if the active PRD has a stored feature branch
        try {
            const { activePrdId } = useRelayStore.getState()
            if (activePrdId) {
                const prd = await window.relayAPI.getPrd(activeProject.id)
                const storedBranch = (prd as Record<string, unknown> | null)?.featureBranch as string | undefined
                if (storedBranch) {
                    const branchInfo = await window.relayAPI.gitBranch(activeProject.id)
                    if (branchInfo.branches.includes(storedBranch)) {
                        if (branchInfo.current !== storedBranch) {
                            await window.relayAPI.gitCheckout(activeProject.id, storedBranch)
                        }
                        setFeatureBranch(storedBranch)
                        setCurrentBranch(storedBranch)
                        await startLoopDirectly()
                        return true
                    }
                }
            }
        } catch {
            // Fall through to git-based check
        }

        return false
    }

    const handleStart = async () => {
        if (!activeProject) return

        // Check if git is initialized
        try {
            const { initialized } = await window.relayAPI.gitCheckInit(activeProject.id)
            if (!initialized) {
                setShowGitInit(true)
                return
            }
        } catch {
            // If check fails, continue — git handlers will surface errors
        }

        // Ensure .gitignore has .relay/
        try {
            await window.relayAPI.gitEnsureGitignore(activeProject.id)
        } catch {
            // Best effort
        }

        // Check for uncommitted changes first
        try {
            const status = await window.relayAPI.gitStatus(activeProject.id)
            if (!status.clean) {
                setDirtyFiles(status.files)
                setShowUncommitted(true)
                return
            }
        } catch {
            // If git status fails, skip the check
        }

        // Try stored branch or current feature branch before showing dialog
        if (await checkBranchAndStart()) return

        // No feature branch — show branch setup dialog
        setShowBranchSetup(true)
    }

    const handleGitInit = async () => {
        if (!activeProject) return
        try {
            await window.relayAPI.gitInit(activeProject.id)
            toast.success('Git repository initialized')
            setShowGitInit(false)
            // Continue the normal start flow
            setShowBranchSetup(true)
        } catch (err) {
            toast.error('Failed to initialize git', { description: err instanceof Error ? err.message : 'Unknown error' })
        }
    }

    const handleStash = async () => {
        if (!activeProject) return
        await window.relayAPI.gitStash(activeProject.id)
        toast.success('Changes stashed')
        setShowUncommitted(false)
        // Re-check branch — don't prompt if already on feature branch
        if (await checkBranchAndStart()) return
        setShowBranchSetup(true)
    }

    const handleCommitExisting = async (message: string) => {
        if (!activeProject) return
        await window.relayAPI.gitCommit(activeProject.id, message)
        toast.success('Changes committed')
        setShowUncommitted(false)
        // Re-check branch — don't prompt if already on feature branch
        if (await checkBranchAndStart()) return
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

        // Persist branch to PRD so it survives stop/restart
        const { activePrdId } = useRelayStore.getState()
        if (activePrdId) {
            try {
                await window.relayAPI.prdSetFeatureBranch(activePrdId, branchName)
            } catch {
                // Best effort — non-critical
            }
        }

        // Now start the loop
        await startLoopDirectly()
    }

    const handlePause = async () => {
        await window.relayAPI.pauseLoop()
    }

    const handleResume = async () => {
        try {
            await window.relayAPI.resumeLoop()
        } catch (err) {
            toast.error('Failed to resume', { description: err instanceof Error ? err.message : 'Unknown error' })
        }
    }

    const handleStop = async () => {
        await window.relayAPI.stopLoop()
        setLoopPrdId(null)
    }

    const [modeOpen, setModeOpen] = useState(false)
    const modeRef = useRef<HTMLDivElement>(null)
    useClickOutside(modeRef, useCallback(() => setModeOpen(false), []), modeOpen)

    const buildModeOptions: { mode: BuildMode; label: string; description: string }[] = [
        { mode: 'review', label: 'Pause for Review', description: 'Pauses after each task for you to approve or reject' },
        { mode: 'auto-pilot', label: 'Auto-Pilot', description: 'Commits each task automatically and continues' },
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

    const [showPrDialog, setShowPrDialog] = useState(false)

    const renderLoopButtons = () => (
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
    )

    return (
        <>
            <div className="flex items-center gap-2">
                {featureComplete ? (
                    <>
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Complete</span>
                        <FeatureCompleteActions
                            prUrl={prUrl}
                            hasRemote={hasRemote}
                            prChecked={prChecked}
                            onShowPrDialog={() => setShowPrDialog(true)}
                            onArchiveFeature={onArchiveFeature}
                        />
                    </>
                ) : (
                    <>
                        <div className={`w-2 h-2 rounded-full ${stateColor[effectiveLoopState]}`} />
                        <span className="text-xs text-muted-foreground">{stateLabel[effectiveLoopState]}</span>

                        {effectiveLoopState === 'idle' || effectiveLoopState === 'stopped' ? (
                            renderLoopButtons()
                        ) : effectiveLoopState === 'running' ? (
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
                        ) : effectiveLoopState === 'paused' ? (
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
                    </>
                )}
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

            {showGitInit && (
                <GitInitDialog
                    onConfirm={handleGitInit}
                    onCancel={() => setShowGitInit(false)}
                />
            )}

            {showPrDialog && (
                <PrCreationDialog
                    onClose={(createdUrl?: string) => {
                        setShowPrDialog(false)
                        if (createdUrl) setPrUrl(createdUrl)
                    }}
                />
            )}
        </>
    )
}
