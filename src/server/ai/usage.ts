import type { AiTask } from "@/generated/prisma/enums";
import { AiProviderError, type AiProvider, type AiRequest, type AiResponse } from "./provider";

/**
 * Registro de uso (AiUsage) e orçamento mensal.
 * O acesso ao banco entra por UsageStore, para testar sem Postgres.
 */

export interface UsageRecord {
  userId: string | null;
  task: AiTask;
  /** Sempre prefixado com o provedor: "claude-cli:<modelo>" ou "anthropic-api:<modelo>". */
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicroUsd: number;
  latencyMs: number | null;
  success: boolean;
  /** Mensagem curta e genérica; nunca contém prompt ou CV. */
  error: string | null;
}

export interface UsageStore {
  record(data: UsageRecord): Promise<{ id: string }>;
  /** Soma de custo das chamadas bem-sucedidas da Claude API a partir de `since`. */
  apiSpentMicroUsd(since: Date): Promise<number>;
  /** A chamada respondeu, mas a resposta não serviu (ex.: JSON inválido): vira success=false. */
  markFailed(id: string, error: string): Promise<void>;
}

export function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface CallAiOptions {
  provider: AiProvider;
  store: UsageStore;
  request: AiRequest;
  userId: string | null;
  monthlyBudgetUsd: number;
  now?: Date;
}

export interface CallAiResult {
  response: AiResponse;
  usageId: string;
  /** Nome gravado em AiUsage.model / JobMatch.model. */
  modelLabel: string;
}

/**
 * Chama o provedor registrando AiUsage (sucesso ou erro).
 * Com anthropic-api, bloqueia antes da chamada se o mês já passou de AI_MONTHLY_BUDGET_USD.
 * (claude-cli usa a assinatura: o limite dele é AI_MAX_EVALUATIONS_PER_RUN, aplicado por quem chama.)
 */
export async function callAi(options: CallAiOptions): Promise<CallAiResult> {
  const { provider, store, request, userId } = options;

  if (provider.name === "anthropic-api") {
    const spent = await store.apiSpentMicroUsd(startOfMonthUtc(options.now ?? new Date()));
    if (spent >= Math.round(options.monthlyBudgetUsd * 1_000_000)) {
      throw new AiProviderError(
        `Orçamento mensal de IA esgotado (US$ ${(spent / 1_000_000).toFixed(2)} de US$ ${options.monthlyBudgetUsd.toFixed(2)}).`,
        "budget",
      );
    }
  }

  const fallbackModel = `${provider.name}:${request.model || "default"}`;
  let response: AiResponse;
  try {
    response = await provider.complete(request);
  } catch (error) {
    const message = error instanceof AiProviderError ? error.message : "Falha inesperada na chamada de IA.";
    await store
      .record({
        userId, task: request.task, model: fallbackModel,
        inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costMicroUsd: 0,
        latencyMs: null, success: false, error: message.slice(0, 300),
      })
      .catch(() => undefined);
    throw error instanceof AiProviderError ? error : new AiProviderError(message, "api");
  }

  const modelLabel = `${provider.name}:${response.model}`;
  const { id } = await store.record({
    userId, task: request.task, model: modelLabel,
    inputTokens: response.inputTokens, outputTokens: response.outputTokens,
    cacheReadTokens: response.cacheReadTokens, cacheWriteTokens: response.cacheWriteTokens,
    costMicroUsd: response.costMicroUsd, latencyMs: response.latencyMs, success: true, error: null,
  });
  return { response, usageId: id, modelLabel };
}
