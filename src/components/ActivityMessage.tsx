import { MessageSquare, Wrench, CheckCircle, AlertCircle } from 'lucide-react'
import type { TaskLog } from '@shared/types'

const iconMap = {
  text: <MessageSquare className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />,
  tool_use: <Wrench className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />,
  tool_result: <CheckCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />,
  error: <AlertCircle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />,
}

interface ActivityMessageProps {
  log: TaskLog
}

export function ActivityMessage({ log }: ActivityMessageProps) {
  const time = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div className="flex gap-2 py-1.5 px-2 text-xs hover:bg-muted/50 rounded">
      <div className="mt-0.5 shrink-0">{iconMap[log.type]}</div>
      <div className="flex-1 min-w-0">
        <p className={`whitespace-pre-wrap break-words ${log.type === 'error' ? 'text-destructive' : 'text-foreground'}`}>
          {log.content}
        </p>
      </div>
      <span className="text-muted-foreground shrink-0 mt-0.5">{time}</span>
    </div>
  )
}
