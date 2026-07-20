// Model pricing (USD per 1M tokens).
//
// Anthropic models come from shared/models.generated.json, which a scheduled GitHub Action
// (.github/workflows/update-models.yml → scripts/update-models.mjs) regenerates from Anthropic's
// public docs. New Claude models therefore appear automatically — no manual edit, no API key.
// OpenAI/Codex models stay hand-maintained here (no comparable public catalog wired up).
import generatedCatalog from './models.generated.json'

export interface ModelPricing {
  inputPer1M: number
  outputPer1M: number
  label: string
  tier: 'fast' | 'balanced' | 'powerful'
  engine?: 'anthropic' | 'openai'
}

export interface ModelOption {
  id: string
  label: string
  tier: 'fast' | 'balanced' | 'powerful'
  engine: 'anthropic' | 'openai'
  costLabel: string
}

interface GeneratedModel {
  id: string
  label: string
  tier: 'fast' | 'balanced' | 'powerful'
  inputPer1M: number | null
  outputPer1M: number | null
}

const catalog = generatedCatalog as { current: GeneratedModel[]; legacy: GeneratedModel[] }

/** Family-based pricing fallback for a generated entry whose price didn't parse. */
export function inferAnthropicPricing(id: string): { inputPer1M: number; outputPer1M: number } {
  if (id.includes('fable') || id.includes('mythos')) return { inputPer1M: 10, outputPer1M: 50 }
  if (id.includes('opus')) return { inputPer1M: 5, outputPer1M: 25 }
  if (id.includes('haiku')) return { inputPer1M: 1, outputPer1M: 5 }
  return { inputPer1M: 3, outputPer1M: 15 } // sonnet + default
}

function toPricing(m: GeneratedModel): ModelPricing {
  const fallback = inferAnthropicPricing(m.id)
  return {
    inputPer1M: m.inputPer1M ?? fallback.inputPer1M,
    outputPer1M: m.outputPer1M ?? fallback.outputPer1M,
    label: m.label,
    tier: m.tier,
    engine: 'anthropic',
  }
}

const ANTHROPIC_CURRENT: Record<string, ModelPricing> = Object.fromEntries(
  catalog.current.map((m) => [m.id, toPricing(m)]),
)

// OpenAI / Codex — hand-maintained. Per-token pricing is approximate; reconcile against OpenAI's page.
const OPENAI_PRICING: Record<string, ModelPricing> = {
  'gpt-5.5': { inputPer1M: 2.50, outputPer1M: 10, label: 'GPT-5.5', tier: 'powerful', engine: 'openai' },
  'gpt-5.3-codex': { inputPer1M: 10, outputPer1M: 40, label: 'GPT-5.3 Codex', tier: 'powerful', engine: 'openai' },
  'gpt-5.4': { inputPer1M: 2.50, outputPer1M: 10, label: 'GPT-5.4', tier: 'balanced', engine: 'openai' },
  'gpt-5.4-mini': { inputPer1M: 0.15, outputPer1M: 0.60, label: 'GPT-5.4 Mini', tier: 'balanced', engine: 'openai' },
  'gpt-5.1-codex-mini': { inputPer1M: 0.25, outputPer1M: 2, label: 'GPT-5.1 Codex Mini', tier: 'fast', engine: 'openai' },
}

export const MODEL_PRICING: Record<string, ModelPricing> = { ...ANTHROPIC_CURRENT, ...OPENAI_PRICING }

// Legacy/aliased IDs no longer in the picker but kept so historical task_metrics rows still
// cost-resolve: superseded Anthropic models (from the catalog) + retired dated/aliased ids.
export const LEGACY_MODEL_PRICING: Record<string, ModelPricing> = {
  ...Object.fromEntries(catalog.legacy.map((m) => [m.id, toPricing(m)])),
  'claude-haiku-4-5-20251001': ANTHROPIC_CURRENT['claude-haiku-4-5'] ?? toPricing({ id: 'claude-haiku-4-5', label: 'Haiku 4.5', tier: 'fast', inputPer1M: 1, outputPer1M: 5 }),
  'gpt-5.3-codex-spark': { inputPer1M: 1.10, outputPer1M: 4.40, label: 'GPT-5.3 Codex Spark', tier: 'fast', engine: 'openai' },
}

const costLabel = (p: ModelPricing) => `$${p.inputPer1M}/M in · $${p.outputPer1M}/M out`

// Ordered list for UI selectors (canonical models only)
export const AVAILABLE_MODELS: ModelOption[] = Object.entries(MODEL_PRICING).map(([id, p]) => ({
  id,
  label: p.label,
  tier: p.tier,
  engine: p.engine ?? 'anthropic',
  costLabel: costLabel(p),
}))

// Default fallback model for pricing — the current balanced Anthropic model, resolved from the catalog.
export const DEFAULT_MODEL =
  catalog.current.find((m) => m.tier === 'balanced')?.id ?? catalog.current[0]?.id ?? 'claude-sonnet-5'

export const DEFAULT_OPENAI_MODEL = 'gpt-5.5'

function resolvePricing(model?: string | null): ModelPricing | undefined {
  if (!model) return undefined
  return MODEL_PRICING[model] ?? LEGACY_MODEL_PRICING[model]
}

export function calculateCost(
  tokensIn: number,
  tokensOut: number,
  model?: string | null,
): number {
  const pricing = resolvePricing(model) ?? MODEL_PRICING[DEFAULT_MODEL] ?? { inputPer1M: 3, outputPer1M: 15, label: '', tier: 'balanced' }
  return (tokensIn * pricing.inputPer1M + tokensOut * pricing.outputPer1M) / 1_000_000
}

export function getModelLabel(model?: string | null): string {
  if (!model) return 'Unknown'
  const pricing = resolvePricing(model)
  if (pricing) return pricing.label
  // Try to extract a friendly name from the model ID
  if (model.includes('fable') || model.includes('mythos')) return 'Fable'
  if (model.includes('opus')) return 'Opus'
  if (model.includes('sonnet')) return 'Sonnet'
  if (model.includes('haiku')) return 'Haiku'
  if (model.includes('codex')) return 'Codex'
  if (model.includes('gpt-5')) return 'GPT-5'
  return model
}
