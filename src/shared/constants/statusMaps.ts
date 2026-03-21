export const statusColors: Record<string, string> = {
        pending: 'text-muted-foreground',
        in_progress: 'text-teal-600 dark:text-teal-400',
        review: 'text-stone-700 dark:text-amber-400',
        failed: 'text-rose-600 dark:text-rose-400',
        done: 'text-emerald-600 dark:text-emerald-400',
}

export const statusLabels: Record<string, string> = {
        pending: 'Pending',
        in_progress: 'In Progress',
        review: 'Review',
        failed: 'Failed',
        done: 'Done',
}

export const statusDots: Record<string, string> = {
        pending: 'bg-stone-400',
        in_progress: 'bg-teal-500 animate-pulse',
        review: 'bg-stone-500 dark:bg-amber-500',
        failed: 'bg-rose-500',
        done: 'bg-emerald-500',
}

export const priorityTextColors = {
        high: 'text-red-600 dark:text-rose-400',
        medium: 'text-amber-600 dark:text-orange-400',
        low: 'text-emerald-600 dark:text-emerald-400',
}

export const priorityBadgeColors = {
        high: 'bg-red-600/10 text-red-600 dark:bg-rose-500/15 dark:text-rose-400',
        medium: 'bg-amber-500/10 text-amber-600 dark:bg-orange-500/15 dark:text-orange-400',
        low: 'bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
}

export const tierColors: Record<string, string> = {
        fast: 'text-emerald-600 dark:text-emerald-400',
        balanced: 'text-orange-600 dark:text-orange-400',
        powerful: 'text-purple-600 dark:text-purple-400',
}
