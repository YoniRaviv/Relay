import { Button } from '@/components/ui/button'
import { LayoutDashboard, FileText, BarChart3, Settings } from 'lucide-react'

export type SidebarView = 'board' | 'prd' | 'summary' | 'settings'

interface ProjectSidebarProps {
  projectName: string
  activeView: SidebarView
  onViewChange: (view: SidebarView) => void
}

const navItems: { id: SidebarView; label: string; icon: React.ReactNode }[] = [
  { id: 'board', label: 'Board', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'prd', label: 'PRD', icon: <FileText className="h-4 w-4" /> },
  { id: 'summary', label: 'Summary', icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
]

export function ProjectSidebar({ projectName, activeView, onViewChange }: ProjectSidebarProps) {
  return (
    <div className="flex flex-col h-full p-4">
      <div className="mb-6">
        <h1 className="text-lg font-bold tracking-tight">Relay</h1>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{projectName}</p>
      </div>

      <nav className="space-y-1">
        {navItems.map((item) => (
          <Button
            key={item.id}
            variant={activeView === item.id ? 'secondary' : 'ghost'}
            className="w-full justify-start gap-2"
            size="sm"
            onClick={() => onViewChange(item.id)}
          >
            {item.icon}
            {item.label}
          </Button>
        ))}
      </nav>
    </div>
  )
}
