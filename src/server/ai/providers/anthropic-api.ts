import Anthropic from "@anthropic-ai/sdk";
import { AiProviderError, type AiProvider, type AiRequest, type AiResponse } from "../provider";
import { computeCostMicroUsd, DEFAULT_API_MODEL } from "../pricing";

/**
 * Provedor da Claude API (SDK oficial). Lê ANTHROPIC_API_KEY.
 * Testado só com mock: não há chave para teste ao vivo nesta fase.
 * Erros nunca carregam o prompt: só o status HTTP.
 */

export interface AnthropicApiOptions {
  apiKey: string;
  defaultModel?: string;
  /** Injetável nos testes. */
  client?: Pick<Anthropic, "messages">;
}

export function createAnthropicApiProvider(options: AnthropicApiOptions): AiProvider {
  if (!options.apiKey) throw new AiProviderError("ANTHROPIC_API_KEY é obrigatória com AI_PROVIDER=anthropic-api.", "config");
  const client = options.client ?? new Anthropic({ apiKey: options.apiKey, maxRetries: 2, timeout: 120_000 });

  return {
    name: "anthropic-api",
    async complete(request: AiRequest): Promise<AiResponse> {
      const model = request.model || options.defaultModel || DEFAULT_API_MODEL;
      const started = Date.now();
      let message: Anthropic.Message;
      try {
        message = await client.messages.create({
          model,
          // Com thinking adaptativo, os tokens de raciocínio contam no limite: deixamos folga.
          max_tokens: Math.max(request.maxOutputTokens, 4096),
          system: request.system,
          messages: [{ role: "user", content: request.user }],
          output_config: { effort: "low" },
        });
      } catch (error) {
        const status = error instanceof Anthropic.APIError && typeof error.status === "number" ? ` (HTTP ${error.status})` : "";
        throw new AiProviderError(`A Claude API retornou erro${status}.`, "api");
      }

      if (message.stop_reason === "refusal") throw new AiProviderError("A Claude API recusou a solicitação.", "api");
      const text = message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
      if (!text) throw new AiProviderError("A Claude API não retornou texto.", "output");

      const tokens = {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
      };
      return {
        text,
        ...tokens,
        costMicroUsd: computeCostMicroUsd(message.model || model, tokens),
        latencyMs: Date.now() - started,
        model: message.model || model,
      };
    },
  };
}
