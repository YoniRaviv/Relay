import type { OutputType } from '@/shared/types/scheduler'

export const OUTPUT_TYPES: Array<{ value: OutputType; label: string }> = [
    { value: 'md', label: 'Markdown doc' },
    { value: 'pr', label: 'Pull request' },
    { value: 'artifact', label: 'Artifact' },
]

// Claude Code CLI model aliases (electron/scheduler/types.ts RunProfile.model) — not the
// AVAILABLE_MODELS pricing ids used elsewhere in the app.
export const MODEL_OPTIONS: Array<{ value: string; label: string }> = [
    { value: '', label: 'Default' },
    { value: 'haiku', label: 'Haiku' },
    { value: 'sonnet', label: 'Sonnet' },
    { value: 'opus', label: 'Opus' },
]
