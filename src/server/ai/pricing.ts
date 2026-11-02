/**
 * Preços da Claude API em USD por 1 milhão de tokens.
 *
 * ⚠️ CONFERIR NA PÁGINA OFICIAL DE PREÇOS antes de confiar no orçamento:
 * https://platform.claude.com/docs/en/about-claude/pricing
 * Os valores abaixo vêm da tabela em cache do skill claude-api (2026-10-06) e podem estar desatualizados.
 * Modelo fora da tabela: custo estimado com o preço do modelo mais caro (para o orçamento errar para o lado seguro).
 *
 * Detalhe útil: 1 USD por milhão de tokens = exatamente 1 micro-dólar por token.
 */
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  /** Escrita no cache de 5 min: 1,25x o preço de entrada. */
  cacheWrite: number;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

/** Modelo padrão do provedor anthropic-api para o matching (barato e suficiente para classificar). */
export const DEFAULT_API_MODEL = "claude-sonnet-5-5";

const FALLBACK_PRICE: ModelPrice = MODEL_PRICES["claude-fable-5-1"];

export function priceFor(model: string): ModelPrice {
  return MODEL_PRICES[model] ?? FALLBACK_PRICE;
}

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** Custo em micro-dólares (inteiro), arredondado para cima. */
export function computeCostMicroUsd(model: string, tokens: TokenCounts): number {
  const p = priceFor(model);
  const total =
    tokens.inputTokens * p.input +
    tokens.outputTokens * p.output +
    tokens.cacheReadTokens * p.cacheRead +
    tokens.cacheWriteTokens * p.cacheWrite;
  return Math.ceil(total);
}
