import { useEffect, useState, useRef, useCallback, type ReactNode } from 'react'
import { Setup } from '@/pages/Setup'
import { PRDWizard } from '@/pages/PRDWizard'
import { Board } from '@/pages/Board'
import { useRelayStore } from '@/store/useRelayStore'
import { useIpcListener } from '@/shared/hooks/useIpcListener'
import type { Project } from '@shared/types'

type AppView = 'loading' | 'setup-key' | 'setup-project' | 'prd-wizard' | 'board'

function ViewTransition({ viewKey, children }: { viewKey: string; children: ReactNode }) {
  const [displayed, setDisplayed] = useState({ key: viewKey, children })
  const [animating, setAnimating] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (viewKey === displayed.key) return

    setAnimating(true)
    const el = containerRef.current
    if (el) {
      el.style.opacity = '0'
      el.style.transform = 'translateY(-3px)'
    }

    const timeout = setTimeout(() => {
      setDisplayed({ key: viewKey, children })
      setAnimating(false)
      if (el) {
        el.style.opacity = ''
        el.style.transform = ''
      }
    }, 80)

    return () => clearTimeout(timeout)
  }, [viewKey, children]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update children without transition when key hasn't changed
  useEffect(() => {
    if (viewKey === displayed.key) {
      setDisplayed(prev => ({ ...prev, children }))
    }
  }, [children, viewKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      key={displayed.key}
      className={`h-full w-full ${!animating ? 'view-transition-enter' : ''}`}
      style={{
        transition: 'opacity 80ms ease-out, transform 80ms ease-out',
      }}
    >
      {displayed.children}
    </div>
  )
}

function App() {
  const [view, setView] = useState<AppView>('loading')
  const {
    setAuthStatus, setActiveProject, setRecentProjects,
    setPrd, setPrdMarkdown, setTasks, setActivePrdId, setFeatures,
    setProjectContext, setScanningProject,
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

    // Load or scan project context (non-blocking for cached, blocking for first scan)
    const existingContext = await window.relayAPI.getProjectContext(project.id)
    if (existingContext) {
      setProjectContext(existingContext)
    } else {
      // First time — scan in background, don't block navigation
      setScanningProject(true)
      window.relayAPI.scanProject(project.id).then(({ context }) => {
        setProjectContext(context)
      }).catch(err => {
        console.error('Project scan failed:', err)
      }).finally(() => {
        setScanningProject(false)
      })
    }

    try {
      const features = await loadFeatures(project.id)
      if (features.length > 0) {
        await selectFeature(project.id, features[0].id)
      }
    } catch (err) {
      console.error('Failed to load project data:', err)
    }
    setView('board')
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
    setProjectContext(null)
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

  const handleWizardBack = () => {
    const project = useRelayStore.getState().activeProject
    const features = useRelayStore.getState().features
    if (project && features.length > 0) {
      selectFeature(project.id, features[0].id)
    }
    setView('board')
  }

  // Menu: open a project folder by path
  const handleMenuOpenProject = useCallback(async (projectPath: unknown) => {
    if (typeof projectPath !== 'string') return
    const project = await window.relayAPI.openProject(projectPath)
    if (project) {
      await handleSetupComplete(project)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useIpcListener('menu:openProject', handleMenuOpenProject, [handleMenuOpenProject])
  useIpcListener('menu:switchProject', handleSwitchProject, [handleSwitchProject])
  useIpcListener('menu:newFeature', handleNewFeature, [handleNewFeature])

  const renderView = () => {
    switch (view) {
      case 'loading':
        return (
          <div className="flex items-center justify-center min-h-screen">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        )
      case 'setup-key':
        return <Setup initialStep={0} onComplete={handleSetupComplete} />
      case 'setup-project':
        return <Setup initialStep={1} onComplete={handleSetupComplete} />
      case 'prd-wizard':
        return <PRDWizard onComplete={handlePrdComplete} onBack={handleWizardBack} />
      case 'board':
        return <Board onSwitchProject={handleSwitchProject} onNewFeature={handleNewFeature} onSelectFeature={handleSelectFeature} />
    }
  }

  return (
    <ViewTransition viewKey={view}>
      {renderView()}
    </ViewTransition>
  )
}

export default App
