import { FolderSync, ChevronRight } from 'lucide-react'

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
      <div className="flex-shrink-0 text-muted-foreground">
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
        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      )}
    </Tag>
  )
}

export function SettingsView({ onSwitchProject }: SettingsViewProps) {
  return (
    <div className="p-6 overflow-auto h-full">
      <h2 className="text-lg font-semibold mb-6">Settings</h2>

      <div className="space-y-6 max-w-lg">
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
