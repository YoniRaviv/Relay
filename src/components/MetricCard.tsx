import type { ReactNode } from 'react'

interface MetricCardProps {
  icon: ReactNode
  label: string
  value: string | number
  subtitle?: string
}

export function MetricCard({ icon, label, value, subtitle }: MetricCardProps) {
  return (
    <div className="rounded-lg bg-card p-4 flex items-start gap-3">
      <div className="rounded-md bg-primary/10 p-2 text-primary">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-2xl font-bold tracking-tight mt-0.5">{value}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
  )
}
