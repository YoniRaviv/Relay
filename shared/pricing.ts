// Anthropic model pricing (USD per 1M tokens)
export interface ModelPricing {
  inputPer1M: number
  outputPer1M: number
  label: string
  tier: 'fast' | 'balanced' | 'powerful'
  engine?: 'anthropic' | 'openai'
}

// Anthropic IDs/pricing verified against the current model catalog (Opus tier is $5/$25,
// Haiku 4.5 is $1/$5). OpenAI/Codex model IDs match the current Codex model catalog; their
// per-token pricing is approximate and should be reconciled against OpenAI's pricing page.
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic
  'claude-haiku-4-5': { inputPer1M: 1, outputPer1M: 5, label: 'Haiku 4.5', tier: 'fast', engine: 'anthropic' },
  'claude-sonnet-4-6': { inputPer1M: 3, outputPer1M: 15, label: 'Sonnet 4.6', tier: 'balanced', engine: 'anthropic' },
  'claude-opus-4-6': { inputPer1M: 5, outputPer1M: 25, label: 'Opus 4.6', tier: 'powerful', engine: 'anthropic' },
  'claude-opus-4-7': { inputPer1M: 5, outputPer1M: 25, label: 'Opus 4.7', tier: 'powerful', engine: 'anthropic' },
  'claude-opus-4-8': { inputPer1M: 5, outputPer1M: 25, label: 'Opus 4.8', tier: 'powerful', engine: 'anthropic' },
  'claude-fable-5': { inputPer1M: 10, outputPer1M: 50, label: 'Fable 5', tier: 'powerful', engine: 'anthropic' },
  // OpenAI / Codex
  'gpt-5.5': { inputPer1M: 2.50, outputPer1M: 10, label: 'GPT-5.5', tier: 'powerful', engine: 'openai' },
  'gpt-5.3-codex': { inputPer1M: 10, outputPer1M: 40, label: 'GPT-5.3 Codex', tier: 'powerful', engine: 'openai' },
  'gpt-5.4': { inputPer1M: 2.50, outputPer1M: 10, label: 'GPT-5.4', tier: 'balanced', engine: 'openai' },
  'gpt-5.4-mini': { inputPer1M: 0.15, outputPer1M: 0.60, label: 'GPT-5.4 Mini', tier: 'balanced', engine: 'openai' },
  'gpt-5.1-codex-mini': { inputPer1M: 0.25, outputPer1M: 2, label: 'GPT-5.1 Codex Mini', tier: 'fast', engine: 'openai' },
}

// Legacy/aliased IDs no longer offered in the picker but kept for accurate cost lookup
// of historical task metrics that recorded the old model strings.
export const LEGACY_MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-haiku-4-5-20251001': MODEL_PRICING['claude-haiku-4-5'],
  'gpt-5.3-codex-spark': { inputPer1M: 1.10, outputPer1M: 4.40, label: 'GPT-5.3 Codex Spark', tier: 'fast', engine: 'openai' },
}

// Ordered list for UI selectors (canonical models only)
export const AVAILABLE_MODELS = Object.entries(MODEL_PRICING).map(([id, p]) => ({
  id,
  label: p.label,
  tier: p.tier,
  engine: p.engine ?? 'anthropic',
  costLabel: `$${p.inputPer1M}/M in · $${p.outputPer1M}/M out`,
}))

// Default fallback model for pricing
export const DEFAULT_MODEL = 'claude-sonnet-4-6'

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
  const pricing = resolvePricing(model) ?? MODEL_PRICING[DEFAULT_MODEL]
  return (tokensIn * pricing.inputPer1M + tokensOut * pricing.outputPer1M) / 1_000_000
}

export function getModelLabel(model?: string | null): string {
  if (!model) return 'Unknown'
  const pricing = resolvePricing(model)
  if (pricing) return pricing.label
  // Try to extract a friendly name from the model ID
  if (model.includes('fable')) return 'Fable'
  if (model.includes('opus')) return 'Opus'
  if (model.includes('sonnet')) return 'Sonnet'
  if (model.includes('haiku')) return 'Haiku'
  if (model.includes('codex')) return 'Codex'
  if (model.includes('gpt-5')) return 'GPT-5'
  return model
}
