import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ExternalLink, Globe, GitPullRequest, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRelayStore } from '@/store/useRelayStore'

interface FeatureCompleteActionsProps {
    prUrl: string | null
    hasRemote: boolean | null
    prChecked: boolean
    onShowPrDialog: () => void
}

export function FeatureCompleteActions({ prUrl, hasRemote, prChecked, onShowPrDialog }: FeatureCompleteActionsProps) {
    const { activeProject } = useRelayStore()
    const [showRemoteInput, setShowRemoteInput] = useState(false)
    const [remoteUrl, setRemoteUrl] = useState('')
    const [addingRemote, setAddingRemote] = useState(false)
    const [localHasRemote, setLocalHasRemote] = useState(hasRemote)

    if (!prChecked) return null

    if (prUrl) {
        return (
            <Button
                size="sm"
                className="h-7 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => window.open(prUrl, '_blank')}
            >
                <ExternalLink className="h-3.5 w-3.5" />
                View PR
            </Button>
        )
    }

    if (localHasRemote === false || hasRemote === false) {
        return (
            <div className="relative">
                <Button
                    size="sm"
                    className="h-7 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => setShowRemoteInput(!showRemoteInput)}
                >
                    <Globe className="h-3.5 w-3.5" />
                    Add Remote
                </Button>
                {showRemoteInput && (
                    <form
                        className="absolute top-full right-0 mt-1 w-80 rounded-lg bg-card border border-border shadow-xl z-50 p-3 space-y-2"
                        onSubmit={async (e) => {
                            e.preventDefault()
                            if (!activeProject || !remoteUrl.trim()) return
                            setAddingRemote(true)
                            try {
                                await window.relayAPI.gitAddRemote(activeProject.id, remoteUrl.trim())
                                setLocalHasRemote(true)
                                setShowRemoteInput(false)
                                setRemoteUrl('')
                                toast.success('Remote added')
                            } catch (err) {
                                toast.error('Failed to add remote', { description: err instanceof Error ? err.message : 'Unknown error' })
                            } finally {
                                setAddingRemote(false)
                            }
                        }}
                    >
                        <p className="text-[11px] font-medium text-muted-foreground">Repository URL</p>
                        <input
                            type="text"
                            value={remoteUrl}
                            onChange={(e) => setRemoteUrl(e.target.value)}
                            placeholder="https://github.com/user/repo.git"
                            className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                            autoFocus
                        />
                        <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="ghost" className="h-7 text-xs" type="button" onClick={() => { setShowRemoteInput(false); setRemoteUrl('') }}>
                                Cancel
                            </Button>
                            <Button size="sm" type="submit" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" disabled={!remoteUrl.trim() || addingRemote}>
                                {addingRemote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add Remote'}
                            </Button>
                        </div>
                    </form>
                )}
            </div>
        )
    }

    return (
        <Button
            size="sm"
            className="h-7 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={onShowPrDialog}
        >
            <GitPullRequest className="h-3.5 w-3.5" />
            Create PR
        </Button>
    )
}
