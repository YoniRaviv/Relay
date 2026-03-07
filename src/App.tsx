import { useEffect, useState } from 'react'
import { Setup } from '@/pages/Setup'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/ui/button'
import { useRelayStore } from '@/store/useRelayStore'
import type { Project } from '@shared/types'

type AppView = 'loading' | 'setup-key' | 'setup-project' | 'home'

function App() {
  const [view, setView] = useState<AppView>('loading')
  const { setAuthStatus, activeProject, setActiveProject, setRecentProjects } = useRelayStore()

  useEffect(() => {
    init()
  }, [])

  const init = async () => {
    const settings = await window.relayAPI.getSettings()
    const authStatus = await window.relayAPI.checkAuth()
    setAuthStatus(authStatus)
    setRecentProjects(settings.recentProjects)

    if (!authStatus.valid) {
      setView('setup-key')
    } else {
      setView('setup-project')
    }
  }

  const handleSetupComplete = (project: Project) => {
    setActiveProject(project)
    setView('home')
  }

  const handleBackToProjects = async () => {
    setActiveProject(null)
    setView('setup-project')
  }

  if (view === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (view === 'setup-key') {
    return <Setup initialStep={0} onComplete={handleSetupComplete} />
  }

  if (view === 'setup-project') {
    return <Setup initialStep={1} onComplete={handleSetupComplete} />
  }

  // Home — placeholder until Phase 3/4
  return (
    <AppShell>
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <h1 className="text-2xl font-semibold">
          {activeProject?.name}
        </h1>
        <p className="text-muted-foreground text-center max-w-md">
          Project loaded. The PRD Wizard and Kanban Board will be available in upcoming phases.
        </p>
        <Button variant="outline" onClick={handleBackToProjects}>
          Switch Project
        </Button>
      </div>
    </AppShell>
  )
}

export default App
