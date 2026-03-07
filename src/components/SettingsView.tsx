import { useState, useEffect } from 'react'
import { FolderSync, ChevronRight, Cpu, Terminal, Shield, Zap, Sparkles } from 'lucide-react'
import { AVAILABLE_MODELS } from '../../shared/pricing'
import type { EngineMode, CliToolsPreset } from '../../shared/types'

interface SettingsViewProps {
  onSwitchProject: () => void
}

interface SettingsRowProps {
  icon: React.ReactNode
  label: string
  description?: string
  onClick?: () => void
  children?: React.ReactNode
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">{title}</h3>
      <div className="rounded-lg bg-card overflow-hidden divide-y divide-border">
        {children}
      </div>
    </div>
  )
}

function SettingsRow({ icon, label, description, onClick, children }: SettingsRowProps) {
  const isClickable = !!onClick
  const Tag = isClickable ? 'button' : 'div'

  return (
    <Tag
      onClick={onClick}
      className={`flex items-center gap-3 w-full px-4 py-3 text-left ${
        isClickable ? 'hover:bg-accent/50 transition-colors cursor-pointer' : ''
      }`}
    >
      <div className="shrink-0 text-muted-foreground">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      {children}
      {isClickable && !children && (
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
    </Tag>
  )
}

function EngineOption({
  selected,
  onSelect,
  icon,
  label,
  description,
  children,
}: {
  selected: boolean
  onSelect: () => void
  icon: React.ReactNode
  label: string
  description: string
  children?: React.ReactNode
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex items-center gap-3 w-full px-4 py-3 text-left transition-colors ${
        selected ? 'bg-accent/60' : 'hover:bg-accent/30'
      }`}
    >
      <div className={`shrink-0 ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      {children}
      <div className={`h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
        selected ? 'border-foreground' : 'border-muted-foreground/40'
      }`}>
        {selected && <div className="h-2 w-2 rounded-full bg-foreground" />}
      </div>
    </button>
  )
}

const tierColors: Record<string, string> = {
  fast: 'text-emerald-600 dark:text-emerald-400',
  balanced: 'text-amber-600 dark:text-amber-400',
  powerful: 'text-purple-600 dark:text-purple-400',
}

export function SettingsView({ onSwitchProject }: SettingsViewProps) {
  const [engineMode, setEngineMode] = useState<EngineMode>('api-key')
  const [toolsPreset, setToolsPreset] = useState<CliToolsPreset>('conservative')
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-20250514')
  const [cliAvailable, setCliAvailable] = useState<{ available: boolean; error?: string } | null>(null)

  useEffect(() => {
    window.relayAPI.getEngineMode().then(setEngineMode)
    window.relayAPI.getCliToolsPreset().then(setToolsPreset)
    window.relayAPI.getSelectedModel().then(setSelectedModel)
    window.relayAPI.checkCliAvailable().then(setCliAvailable)
  }, [])

  const handleEngineChange = async (mode: EngineMode) => {
    setEngineMode(mode)
    await window.relayAPI.setEngineMode(mode)
  }

  const handlePresetChange = async (preset: CliToolsPreset) => {
    setToolsPreset(preset)
    await window.relayAPI.setCliToolsPreset(preset)
  }

  const handleModelChange = async (model: string) => {
    setSelectedModel(model)
    await window.relayAPI.setSelectedModel(model)
  }

  return (
    <div className="p-6 overflow-auto h-full">
      <h2 className="text-lg font-semibold mb-6">Settings</h2>

      <div className="space-y-6 max-w-lg">
        <SettingsSection title="Execution Engine">
          <EngineOption
            selected={engineMode === 'api-key'}
            onSelect={() => handleEngineChange('api-key')}
            icon={<Cpu className="h-4 w-4" />}
            label="API Key"
            description="Direct Anthropic API with your sk-ant-* key"
          />
          <EngineOption
            selected={engineMode === 'claude-code'}
            onSelect={() => handleEngineChange('claude-code')}
            icon={<Terminal className="h-4 w-4" />}
            label="Claude Code CLI"
            description="Uses your existing Claude Code authentication"
          />
        </SettingsSection>

        <SettingsSection title="Model">
          {AVAILABLE_MODELS.map((m) => (
            <EngineOption
              key={m.id}
              selected={selectedModel === m.id}
              onSelect={() => handleModelChange(m.id)}
              icon={<Sparkles className="h-4 w-4" />}
              label={m.label}
              description={m.costLabel}
            >
              <span className={`text-[11px] font-medium uppercase tracking-wide ${tierColors[m.tier]}`}>
                {m.tier}
              </span>
            </EngineOption>
          ))}
        </SettingsSection>

        {engineMode === 'claude-code' && (
          <>
            <SettingsSection title="CLI Status">
              <SettingsRow
                icon={<Terminal className="h-4 w-4" />}
                label={cliAvailable?.available ? 'Claude Code SDK Available' : 'Claude Code SDK Not Found'}
                description={
                  cliAvailable?.available
                    ? 'Ready to use your existing authentication'
                    : cliAvailable?.error ?? 'Checking...'
                }
              >
                <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                  cliAvailable === null ? 'bg-muted-foreground/40' : cliAvailable.available ? 'bg-green-500' : 'bg-red-500'
                }`} />
              </SettingsRow>
            </SettingsSection>

            <SettingsSection title="Tool Permissions">
              <EngineOption
                selected={toolsPreset === 'conservative'}
                onSelect={() => handlePresetChange('conservative')}
                icon={<Shield className="h-4 w-4" />}
                label="Conservative"
                description="File operations only (Read, Edit, Write, Glob, Grep)"
              />
              <EngineOption
                selected={toolsPreset === 'full'}
                onSelect={() => handlePresetChange('full')}
                icon={<Zap className="h-4 w-4" />}
                label="Full"
                description="Includes shell access (Bash, WebFetch, NotebookEdit)"
              />
            </SettingsSection>
          </>
        )}

        <SettingsSection title="Project">
          <SettingsRow
            icon={<FolderSync className="h-4 w-4" />}
            label="Switch Project"
            description="Change the active project or create a new one"
            onClick={onSwitchProject}
          />
        </SettingsSection>
      </div>
    </div>
  )
}
