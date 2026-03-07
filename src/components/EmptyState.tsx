import { Inbox } from 'lucide-react'

interface EmptyStateProps {
  message?: string
}

export function EmptyState({ message = 'No tasks yet' }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <Inbox className="h-8 w-8 mb-2 opacity-50" />
      <p className="text-sm">{message}</p>
    </div>
  )
}
