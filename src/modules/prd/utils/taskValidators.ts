import type { DecomposedTask } from '@/shared/types/prd'

const LAYER_SCOPED_TITLE = /^\s*(schema|migration|migrations|api|endpoint|endpoints|backend|frontend|ui|tests?|types?|interfaces?)\b/i
const LAYER_SCOPED_PHRASES = /\b(add (?:database |db )?(?:column|table|index|migration)|set up (?:types|interfaces|api routes)|create (?:endpoints?|api routes))\b/i

export function detectHorizontalSlice(task: Pick<DecomposedTask, 'title' | 'description'>): string | null {
    if (LAYER_SCOPED_TITLE.test(task.title)) {
        return 'Title looks layer-scoped (e.g. schema/api/ui). Vertical slices should describe an end-to-end behavior, not one layer.'
    }
    if (LAYER_SCOPED_PHRASES.test(task.title) || LAYER_SCOPED_PHRASES.test(task.description)) {
        return 'Description focuses on a single layer. Consider widening to a thin end-to-end slice.'
    }
    return null
}
