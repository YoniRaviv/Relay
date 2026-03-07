import { Button } from '@/components/ui/button'
import { Play, Pause, Square } from 'lucide-react'
import { useRelayStore } from '@/store/useRelayStore'

export function LoopControls() {
  const { loopState, setLoopState, activeProject, clearActivity } = useRelayStore()

  const handleStart = async () => {
    if (!activeProject) return
    clearActivity()
    setLoopState('running')
    await window.relayAPI.startLoop(activeProject.id)
  }

  const handlePause = async () => {
    setLoopState('paused')
    await window.relayAPI.pauseLoop()
  }

  const handleResume = async () => {
    setLoopState('running')
    await window.relayAPI.resumeLoop()
  }

  const handleStop = async () => {
    setLoopState('stopped')
    await window.relayAPI.stopLoop()
  }

  const stateLabel: Record<string, string> = {
    idle: 'Idle',
    running: 'Running',
    paused: 'Paused',
    stopped: 'Stopped',
  }

  const stateColor: Record<string, string> = {
    idle: 'bg-gray-400',
    running: 'bg-green-500 animate-pulse',
    paused: 'bg-yellow-500',
    stopped: 'bg-red-500',
  }

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${stateColor[loopState]}`} />
      <span className="text-xs text-muted-foreground">{stateLabel[loopState]}</span>

      {loopState === 'idle' || loopState === 'stopped' ? (
        <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={handleStart}>
          <Play className="h-3.5 w-3.5" />
          Start
        </Button>
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
  )
}
