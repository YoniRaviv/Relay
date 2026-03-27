import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FolderOpen, Plus, Clock, FolderPlus } from 'lucide-react'
import type { RecentProject, Project } from '@shared/types'

function slugifyName(name: string): string {
    return name.trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'new-project'
}

interface ProjectSelectorProps {
    onProjectSelected: (project: Project) => void
}

export function ProjectSelector({ onProjectSelected }: ProjectSelectorProps) {
    const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
    const [creating, setCreating] = useState(false)
    const [projectName, setProjectName] = useState('')
    const [selectedPath, setSelectedPath] = useState('')
    const [error, setError] = useState('')

    useEffect(() => {
        window.relayAPI.listProjects().then(setRecentProjects)
    }, [])

    const selectFolder = async () => {
        const path = await window.relayAPI.selectFolder()
        if (path) setSelectedPath(path)
    }

    const createProject = async () => {
        if (!projectName.trim() || !selectedPath) return
        setError('')
        try {
            const project = await window.relayAPI.createProject({
                name: projectName.trim(),
                path: selectedPath,
            })
            onProjectSelected(project)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create project')
        }
    }

    const openProject = async (projectPath: string) => {
        setError('')
        try {
            const project = await window.relayAPI.openProject(projectPath)
            if (project) {
                onProjectSelected(project)
            } else {
                setError('Could not open project at ' + projectPath)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to open project')
        }
    }

    const openExisting = async () => {
        const folderPath = await window.relayAPI.selectFolder()
        if (folderPath) await openProject(folderPath)
    }

    if (creating) {
        return (
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="projectName">Project Name</Label>
                    <Input
                        id="projectName"
                        placeholder="My Feature"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                    />
                </div>

                <div className="space-y-2">
                    <Label>Parent Folder</Label>
                    <div className="flex gap-2">
                        <Input
                            readOnly
                            value={selectedPath}
                            placeholder="Select where to create the project..."
                            className="flex-1"
                        />
                        <Button variant="outline" onClick={selectFolder}>
                            <FolderOpen className="h-4 w-4" />
                        </Button>
                    </div>
                    {selectedPath && projectName.trim() && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <FolderPlus className="h-3 w-3 shrink-0" />
                            <span className="shrink-0">Will create:</span>
                            <span className="font-mono truncate">{selectedPath}/{slugifyName(projectName)}</span>
                        </div>
                    )}
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setCreating(false)} className="flex-1">
                        Back
                    </Button>
                    <Button
                        onClick={createProject}
                        disabled={!projectName.trim() || !selectedPath}
                        className="flex-1"
                    >
                        Create Project
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => setCreating(true)}>
                    <Plus className="h-5 w-5" />
                    <span className="text-sm">Create New</span>
                </Button>
                <Button variant="outline" className="h-20 flex-col gap-2" onClick={openExisting}>
                    <FolderOpen className="h-5 w-5" />
                    <span className="text-sm">Open Existing</span>
                </Button>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {recentProjects.length > 0 && (
                <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        Recent Projects
                    </p>
                    <div className="space-y-1.5">
                        {recentProjects.map((p) => (
                            <Card
                                key={p.path}
                                className="cursor-pointer hover:bg-accent transition-colors"
                                onClick={() => openProject(p.path)}
                            >
                                <CardContent className="p-3">
                                    <p className="text-sm font-medium">{p.name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{p.path}</p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
