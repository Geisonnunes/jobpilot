import type { AiTask } from "@/generated/prisma/enums";

/**
 * Interface de provedor de IA. Quem usa a IA só conhece este contrato:
 * trocar de provedor é mudar a variável AI_PROVIDER.
 */

export type AiProviderName = "claude-cli" | "anthropic-api";

export interface AiRequest {
  system: string;
  user: string;
  /** Vazio/ausente: o provedor usa o modelo padrão dele. */
  model?: string;
  maxOutputTokens: number;
  task: AiTask;
}

export interface AiResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Micro-dólares (1 USD = 1_000_000). 0 quando o provedor não informa. */
  costMicroUsd: number;
  latencyMs: number;
  /** Modelo que respondeu (ou o pedido, se o provedor não informar). */
  model: string;
}

export interface AiProvider {
  readonly name: AiProviderName;
  complete(request: AiRequest): Promise<AiResponse>;
}

/**
 * Erro de provedor. A mensagem NUNCA contém o prompt (que inclui o currículo):
 * só um motivo curto e genérico, seguro para log e para a tabela AiUsage.
 */
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly code: "timeout" | "spawn" | "exit" | "output" | "api" | "budget" | "config",
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}
