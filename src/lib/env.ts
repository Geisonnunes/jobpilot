import { z } from "zod";

/**
 * Variáveis de ambiente validadas na inicialização.
 * Se faltar algo obrigatório, o app falha cedo com uma mensagem clara
 * em vez de quebrar no meio de uma coleta ou chamada de IA.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  // Opcionais na Fase 1; passam a ser exigidos nas fases seguintes.
  ANTHROPIC_API_KEY: z.string().optional(),
  AUTH_SECRET: z.string().optional(),
  AI_MONTHLY_BUDGET_USD: z.coerce.number().positive().default(10),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Variáveis de ambiente inválidas:", z.treeifyError(parsed.error));
  throw new Error("Variáveis de ambiente inválidas. Confira o arquivo .env.");
}

export const env = parsed.data;
