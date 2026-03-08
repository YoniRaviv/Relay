import { useEffect, useState } from 'react'
import { Setup } from '@/pages/Setup'
import { PRDWizard } from '@/pages/PRDWizard'
import { Board } from '@/pages/Board'
import { useRelayStore } from '@/store/useRelayStore'
import type { Project } from '@shared/types'

type AppView = 'loading' | 'setup-key' | 'setup-project' | 'prd-wizard' | 'board'

function App() {
  const [view, setView] = useState<AppView>('loading')
  const {
    setAuthStatus, setActiveProject, setRecentProjects,
    setPrd, setPrdMarkdown, setTasks, setActivePrdId, setFeatures,
  } = useRelayStore()

  useEffect(() => {
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  const loadFeatures = async (projectId: string) => {
    const features = await window.relayAPI.listPrds(projectId)
    setFeatures(features)
    return features
  }

  const selectFeature = async (projectId: string, prdId: string) => {
    setActivePrdId(prdId)
    const features = useRelayStore.getState().features
    const feature = features.find(f => f.id === prdId)
    if (feature) {
      setPrd(feature)
      setPrdMarkdown(feature.markdown)
    }
    const tasks = await window.relayAPI.listTasks(projectId, prdId)
    setTasks(tasks)
  }

  const handleSetupComplete = async (project: Project) => {
    setActiveProject(project)

    try {
      const features = await loadFeatures(project.id)
      if (features.length > 0) {
        // Select the most recent feature
        await selectFeature(project.id, features[0].id)
        setView('board')
      } else {
        setView('prd-wizard')
      }
    } catch (err) {
      console.error('Failed to load project data:', err)
      setView('prd-wizard')
    }
  }

  const handlePrdComplete = async () => {
    const project = useRelayStore.getState().activeProject
    if (project) {
      const features = await loadFeatures(project.id)
      if (features.length > 0) {
        await selectFeature(project.id, features[0].id)
      }
    }
    setView('board')
  }

  const handleSwitchProject = () => {
    setActiveProject(null)
    setTasks([])
    setPrd(null)
    setPrdMarkdown('')
    setActivePrdId(null)
    setFeatures([])
    setView('setup-project')
  }

  const handleNewFeature = () => {
    setTasks([])
    setPrd(null)
    setPrdMarkdown('')
    setActivePrdId(null)
    useRelayStore.getState().setWizardStep(0)
    useRelayStore.getState().setFeatureDescription('')
    setView('prd-wizard')
  }

  const handleSelectFeature = async (prdId: string) => {
    const project = useRelayStore.getState().activeProject
    if (!project) return
    await selectFeature(project.id, prdId)
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
    const hasFeatures = useRelayStore.getState().features.length > 0
    const handleWizardBack = hasFeatures
      ? () => {
          // Go back to board with the previously active feature
          const project = useRelayStore.getState().activeProject
          const features = useRelayStore.getState().features
          if (project && features.length > 0) {
            selectFeature(project.id, features[0].id)
          }
          setView('board')
        }
      : handleSwitchProject
    return <PRDWizard onComplete={handlePrdComplete} onBack={handleWizardBack} />
  }

  return <Board onSwitchProject={handleSwitchProject} onNewFeature={handleNewFeature} onSelectFeature={handleSelectFeature} />
}

export default App
