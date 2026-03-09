import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, GitBranch, Loader2, ChevronDown } from 'lucide-react'
import { useRelayStore } from '@/store/useRelayStore'

interface BranchSetupDialogProps {
    onConfirm: (branchName: string, baseBranch: string) => Promise<void>
    onCancel: () => void
}

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60)
}

export function BranchSetupDialog({ onConfirm, onCancel }: BranchSetupDialogProps) {
    const { activeProject, branches, setBranches, setCurrentBranch } = useRelayStore()
    const [baseBranch, setBaseBranch] = useState('')
    const [branchName, setBranchName] = useState('')
    const [loading, setLoading] = useState(false)
    const [fetchingBranches, setFetchingBranches] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [showDropdown, setShowDropdown] = useState(false)

    // Fetch branches and generate default name
    useEffect(() => {
        if (!activeProject) return
        const init = async () => {
            setFetchingBranches(true)
            try {
                const info = await window.relayAPI.gitBranch(activeProject.id)
                setBranches(info.branches)
                setCurrentBranch(info.current)

                // Default base branch: prefer main, then master, then current
                const preferred = ['main', 'master', 'develop']
                const defaultBase = preferred.find(b => info.branches.includes(b)) ?? info.current
                setBaseBranch(defaultBase)

                // Generate branch name from active PRD title
                const { prd, features, activePrdId } = useRelayStore.getState()
                const prdTitle = prd?.description
                    ?? features.find(f => f.id === activePrdId)?.description
                    ?? 'new-feature'
                setBranchName(`feature/${slugify(prdTitle)}`)
            } catch {
                setError('Failed to fetch branches')
            } finally {
                setFetchingBranches(false)
            }
        }
        init()
    }, [activeProject?.id]) // eslint-disable-line react-hooks/exhaustive-deps

    const handleConfirm = async () => {
        if (!branchName.trim() || !baseBranch) return
        setLoading(true)
        setError(null)
        try {
            // Check if branch already exists
            if (branches.includes(branchName)) {
                setError(`Branch "${branchName}" already exists. Choose a different name.`)
                setLoading(false)
                return
            }
            await onConfirm(branchName, baseBranch)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create branch')
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4">
                <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-[var(--color-sidebar)]">
                    <div className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4 text-muted-foreground" />
                        <h3 className="font-semibold text-sm">Create Feature Branch</h3>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCancel} disabled={loading}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {fetchingBranches ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <>
                        <div className="p-5 space-y-4">
                            {/* Base branch selector */}
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Base branch
                                </Label>
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setShowDropdown(!showDropdown)}
                                        className="w-full flex items-center justify-between px-3 py-2 text-sm font-mono rounded-md border border-border bg-background hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring"
                                    >
                                        <span>{baseBranch || 'Select branch...'}</span>
                                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                    </button>
                                    {showDropdown && (
                                        <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-auto rounded-md border border-border bg-card shadow-lg z-10">
                                            {branches.map((b) => (
                                                <button
                                                    key={b}
                                                    type="button"
                                                    onClick={() => {
                                                        setBaseBranch(b)
                                                        setShowDropdown(false)
                                                    }}
                                                    className={`w-full text-left px-3 py-1.5 text-sm font-mono hover:bg-muted/50 ${
                                                        b === baseBranch ? 'bg-muted/70 text-foreground' : 'text-muted-foreground'
                                                    }`}
                                                >
                                                    {b}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Branch name */}
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Branch name
                                </Label>
                                <Input
                                    value={branchName}
                                    onChange={(e) => setBranchName(e.target.value)}
                                    className="font-mono text-sm"
                                    placeholder="feature/my-feature"
                                />
                            </div>

                            {error && (
                                <p className="text-xs text-destructive">{error}</p>
                            )}

                            <p className="text-xs text-muted-foreground">
                                Will checkout <span className="font-mono">{baseBranch}</span>, pull latest, and create <span className="font-mono">{branchName}</span>.
                            </p>
                        </div>

                        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
                            <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
                                Cancel
                            </Button>
                            <Button size="sm" onClick={handleConfirm} disabled={!branchName.trim() || !baseBranch || loading}>
                                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <GitBranch className="h-3.5 w-3.5 mr-1.5" />}
                                Create Branch & Start
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
