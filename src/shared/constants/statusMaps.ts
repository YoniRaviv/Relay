export const statusColors: Record<string, string> = {
        pending: 'text-muted-foreground',
        in_progress: 'text-teal-600 dark:text-teal-400',
        review: 'text-amber-600 dark:text-amber-400',
        failed: 'text-rose-600 dark:text-rose-400',
        done: 'text-emerald-600 dark:text-emerald-400',
        approved: 'text-emerald-600 dark:text-emerald-400',
}

export const statusLabels: Record<string, string> = {
        pending: 'Pending',
        in_progress: 'In Progress',
        review: 'Review',
        failed: 'Failed',
        done: 'Done',
        approved: 'Approved',
}

export const statusDots: Record<string, string> = {
        pending: 'bg-stone-400',
        in_progress: 'bg-teal-500 animate-pulse',
        review: 'bg-amber-500',
        failed: 'bg-rose-500',
        done: 'bg-emerald-500',
        approved: 'bg-emerald-600',
}

export const priorityTextColors = {
        high: 'text-rose-600 dark:text-rose-400',
        medium: 'text-amber-600 dark:text-amber-400',
        low: 'text-emerald-600 dark:text-emerald-400',
}

export const priorityBadgeColors = {
        high: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
        medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
        low: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
}

export const tierColors: Record<string, string> = {
        fast: 'text-emerald-600 dark:text-emerald-400',
        balanced: 'text-amber-600 dark:text-amber-400',
        powerful: 'text-purple-600 dark:text-purple-400',
}
