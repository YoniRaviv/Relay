function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />
}

export function BoardSkeleton() {
  return (
    <div className="flex gap-4 p-6 h-full">
      {[0, 1, 2].map(col => (
        <div key={col} className="flex-1 space-y-3">
          <Skeleton className="h-8 w-24" />
          {Array.from({ length: col === 0 ? 4 : col === 1 ? 2 : 1 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function TaskDetailSkeleton() {
  return (
    <div className="p-4 space-y-4 w-80">
      <Skeleton className="h-5 w-16" />
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-24 w-full" />
    </div>
  )
}

export function SummarySkeleton() {
  return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-7 w-40" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
