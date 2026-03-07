import { useEffect, useState } from 'react'
import { Setup } from '@/pages/Setup'
import { PRDWizard } from '@/pages/PRDWizard'
import { Board } from '@/pages/Board'
import { useRelayStore } from '@/store/useRelayStore'
import type { Project } from '@shared/types'

type AppView = 'loading' | 'setup-key' | 'setup-project' | 'prd-wizard' | 'board'

function App() {
  const [view, setView] = useState<AppView>('loading')
  const { setAuthStatus, setActiveProject, setRecentProjects, setPrd, setPrdMarkdown, setTasks } = useRelayStore()

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

  const handleSetupComplete = async (project: Project) => {
    setActiveProject(project)

    const prd = await window.relayAPI.getPrd(project.id)
    if (prd) {
      setPrd(prd)
      setPrdMarkdown(prd.markdown as string)
      const tasks = await window.relayAPI.listTasks(project.id)
      setTasks(tasks)
      setView('board')
    } else {
      setView('prd-wizard')
    }
  }

  const handlePrdComplete = async () => {
    const project = useRelayStore.getState().activeProject
    if (project) {
      const tasks = await window.relayAPI.listTasks(project.id)
      setTasks(tasks)
    }
    setView('board')
  }

  const handleSwitchProject = () => {
    setActiveProject(null)
    setTasks([])
    setPrd(null)
    setPrdMarkdown('')
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

  if (view === 'prd-wizard') {
    return <PRDWizard onComplete={handlePrdComplete} />
  }

  return <Board onSwitchProject={handleSwitchProject} />
}

export default App
