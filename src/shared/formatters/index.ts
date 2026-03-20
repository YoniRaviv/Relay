export function formatDuration(ms: number): string {
        if (ms === 0) return '0s'
        const seconds = Math.floor(ms / 1000)
        if (seconds < 60) return `${seconds}s`
        const minutes = Math.floor(seconds / 60)
        const remainingSec = seconds % 60
        if (minutes < 60) return `${minutes}m ${remainingSec}s`
        const hours = Math.floor(minutes / 60)
        const remainingMin = minutes % 60
        return `${hours}h ${remainingMin}m`
}

export function formatNumber(n: number): string {
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
        if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
        return n.toString()
}

export function formatCost(cost: number): string {
        if (cost < 0.01) return '<$0.01'
        return `$${cost.toFixed(2)}`
}

export function extractTitle(description: string, title?: string | null): string {
        if (title) return title
        const first = description.split('\n')[0].trim()
        return first || 'Untitled Feature'
}
