import { env } from "@/lib/env";
import { AiProviderError, type AiProvider } from "./provider";
import { createAnthropicApiProvider } from "./providers/anthropic-api";
import { createClaudeCliProvider } from "./providers/claude-cli";

/** Escolhe o provedor pela variável AI_PROVIDER (padrão: claude-cli). */
export function getAiProvider(): AiProvider {
  if (env.AI_PROVIDER === "anthropic-api") {
    if (!env.ANTHROPIC_API_KEY) throw new AiProviderError("ANTHROPIC_API_KEY é obrigatória com AI_PROVIDER=anthropic-api.", "config");
    return createAnthropicApiProvider({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return createClaudeCliProvider({ executable: env.CLAUDE_CLI_PATH });
}
