import { z } from "zod";

/**
 * Variáveis de ambiente validadas na inicialização.
 * Se faltar algo obrigatório, o app falha cedo com uma mensagem clara
 * em vez de quebrar no meio de uma coleta ou chamada de IA.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  // Opcional até a Fase 3 (matching com IA).
  ANTHROPIC_API_KEY: z.string().optional(),
  // Auth.js — obrigatórios para o login funcionar
  AUTH_SECRET: z.string().min(1, "Gere com: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""),
  AUTH_GITHUB_ID: z.string().min(1, "Client ID do OAuth App do GitHub"),
  AUTH_GITHUB_SECRET: z.string().min(1, "Client secret do OAuth App do GitHub"),
  AI_MONTHLY_BUDGET_USD: z.coerce.number().positive().default(10),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Variáveis de ambiente inválidas:", z.treeifyError(parsed.error));
  throw new Error("Variáveis de ambiente inválidas. Confira o arquivo .env.");
}

export const env = parsed.data;
