// Anthropic model pricing (USD per 1M tokens)
export interface ModelPricing {
  inputPer1M: number
  outputPer1M: number
  label: string
  tier: 'fast' | 'balanced' | 'powerful'
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-haiku-4-5-20251001': { inputPer1M: 0.80, outputPer1M: 4, label: 'Haiku 4.5', tier: 'fast' },
  'claude-sonnet-4-20250514': { inputPer1M: 3, outputPer1M: 15, label: 'Sonnet 4', tier: 'balanced' },
  'claude-sonnet-4-6': { inputPer1M: 3, outputPer1M: 15, label: 'Sonnet 4.6', tier: 'balanced' },
  'claude-opus-4-6': { inputPer1M: 15, outputPer1M: 75, label: 'Opus 4.6', tier: 'powerful' },
}

// Ordered list for UI selectors
export const AVAILABLE_MODELS = Object.entries(MODEL_PRICING).map(([id, p]) => ({
  id,
  label: p.label,
  tier: p.tier,
  costLabel: `$${p.inputPer1M}/M in · $${p.outputPer1M}/M out`,
}))

// Default fallback model for pricing
export const DEFAULT_MODEL = 'claude-sonnet-4-20250514'

export function calculateCost(
  tokensIn: number,
  tokensOut: number,
  model?: string | null,
): number {
  const pricing = MODEL_PRICING[model ?? DEFAULT_MODEL]
    ?? MODEL_PRICING[DEFAULT_MODEL]
  return (tokensIn * pricing.inputPer1M + tokensOut * pricing.outputPer1M) / 1_000_000
}

export function getModelLabel(model?: string | null): string {
  if (!model) return 'Unknown'
  const pricing = MODEL_PRICING[model]
  if (pricing) return pricing.label
  // Try to extract a friendly name from the model ID
  if (model.includes('opus')) return 'Opus'
  if (model.includes('sonnet')) return 'Sonnet'
  if (model.includes('haiku')) return 'Haiku'
  return model
}
