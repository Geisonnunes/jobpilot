import { z } from "zod";

/**
 * Variáveis de ambiente validadas na inicialização.
 * Se faltar algo obrigatório, o app falha cedo com uma mensagem clara
 * em vez de quebrar no meio de uma coleta ou chamada de IA.
 */
/** "" (variável presente mas vazia no .env) conta como não definida. */
const optionalString = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().optional());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  // IA (Fase 3). O provedor padrão usa o Claude Code local (assinatura), sem chave de API.
  AI_PROVIDER: z.enum(["claude-cli", "anthropic-api"]).default("claude-cli"),
  // Obrigatória apenas com AI_PROVIDER=anthropic-api (veja a validação abaixo).
  ANTHROPIC_API_KEY: optionalString,
  // Vazio: o provedor usa o modelo padrão dele.
  AI_MODEL_MATCH: optionalString,
  // Caminho do executável do Claude Code (opcional; padrão: "claude" no PATH).
  CLAUDE_CLI_PATH: optionalString,
  AI_MAX_EVALUATIONS_PER_RUN: z.coerce.number().int().min(1).max(200).default(10),
  // Auth.js — obrigatórios para o login funcionar
  AUTH_SECRET: z.string().min(1, "Gere com: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""),
  AUTH_GITHUB_ID: z.string().min(1, "Client ID do OAuth App do GitHub"),
  AUTH_GITHUB_SECRET: z.string().min(1, "Client secret do OAuth App do GitHub"),
  AI_MONTHLY_BUDGET_USD: z.coerce.number().positive().default(10),
}).superRefine((value, ctx) => {
  if (value.AI_PROVIDER === "anthropic-api" && !value.ANTHROPIC_API_KEY) {
    ctx.addIssue({ code: "custom", path: ["ANTHROPIC_API_KEY"], message: "Obrigatória quando AI_PROVIDER=anthropic-api" });
  }
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Variáveis de ambiente inválidas:", z.treeifyError(parsed.error));
  throw new Error("Variáveis de ambiente inválidas. Confira o arquivo .env.");
}

export const env = parsed.data;
