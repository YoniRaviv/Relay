// Anthropic model pricing (USD per 1M tokens)
export interface ModelPricing {
  inputPer1M: number
  outputPer1M: number
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4-20250514': { inputPer1M: 3, outputPer1M: 15 },
  'claude-opus-4-6': { inputPer1M: 15, outputPer1M: 75 },
}

// The model currently used by the agent
export const ACTIVE_MODEL = 'claude-sonnet-4-20250514'

export function calculateCost(
  tokensIn: number,
  tokensOut: number,
  model: string = ACTIVE_MODEL,
): number {
  const pricing = MODEL_PRICING[model]
  if (!pricing) return 0
  return (tokensIn * pricing.inputPer1M + tokensOut * pricing.outputPer1M) / 1_000_000
}
