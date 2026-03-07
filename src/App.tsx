import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useRelayStore } from '@/store/useRelayStore'

function App() {
  const [loading, setLoading] = useState(true)
  const { authStatus, setAuthStatus } = useRelayStore()

  useEffect(() => {
    window.relayAPI.checkAuth().then((status) => {
      setAuthStatus(status)
      setLoading(false)
    })
  }, [setAuthStatus])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Relay</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <p className="text-muted-foreground text-center">
            Visual Kanban build loop for autonomous code generation
          </p>
          <p className="text-sm text-muted-foreground">
            Auth status: {authStatus.valid ? 'Connected' : 'Not connected'}
          </p>
          <Button>Get Started</Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default App
