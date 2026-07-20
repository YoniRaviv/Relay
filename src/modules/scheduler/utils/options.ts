import { AVAILABLE_MODELS } from '@shared/pricing'
import type { OutputType } from '@/shared/types/scheduler'

export const OUTPUT_TYPES: Array<{ value: OutputType; label: string }> = [
    { value: 'md', label: 'Markdown doc' },
    { value: 'pr', label: 'Pull request' },
    { value: 'artifact', label: 'Artifact' },
]

// Sourced from the auto-updating catalog (shared/models.generated.json) so new Claude models
// appear here without a manual edit. Values are full model ids, which Claude Code accepts via
// --model; '' means the CLI's own default.
export const MODEL_OPTIONS: Array<{ value: string; label: string }> = [
    { value: '', label: 'Default' },
    ...AVAILABLE_MODELS.filter((m) => m.engine === 'anthropic').map((m) => ({ value: m.id, label: m.label })),
]
