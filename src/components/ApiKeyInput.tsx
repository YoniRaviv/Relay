import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'

interface ApiKeyInputProps {
  onVerified: () => void
}

export function ApiKeyInput({ onVerified }: ApiKeyInputProps) {
  const [key, setKey] = useState('')
  const [status, setStatus] = useState<'idle' | 'verifying' | 'valid' | 'invalid'>('idle')
  const [error, setError] = useState('')

  const verify = async () => {
    if (!key.trim()) return
    setStatus('verifying')
    setError('')

    const result = await window.relayAPI.setApiKey(key.trim())
    if (result.valid) {
      setStatus('valid')
      setTimeout(onVerified, 600)
    } else {
      setStatus('invalid')
      setError(result.error || 'Invalid API key')
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="apiKey">Anthropic API Key</Label>
        <div className="flex gap-2">
          <Input
            id="apiKey"
            type="password"
            placeholder="sk-ant-..."
            value={key}
            onChange={(e) => {
              setKey(e.target.value)
              setStatus('idle')
              setError('')
            }}
            onKeyDown={(e) => e.key === 'Enter' && verify()}
            className="flex-1"
          />
          <Button onClick={verify} disabled={!key.trim() || status === 'verifying'}>
            {status === 'verifying' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Verify'
            )}
          </Button>
        </div>
      </div>

      {status === 'valid' && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle className="h-4 w-4" />
          API key verified
        </div>
      )}

      {status === 'invalid' && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <XCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Your key is encrypted and stored locally. It never leaves your machine except for API calls.
      </p>
    </div>
  )
}
