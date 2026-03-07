import type { ReactNode } from 'react'

interface AppShellProps {
  sidebar?: ReactNode
  children: ReactNode
}

export function AppShell({ sidebar, children }: AppShellProps) {
  return (
    <div className="flex h-screen">
      {sidebar && (
        <aside className="w-60 border-r bg-muted/30 flex-shrink-0">
          {sidebar}
        </aside>
      )}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
