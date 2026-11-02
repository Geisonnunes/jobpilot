import { createHash } from "node:crypto";
import { normalizeForComparison } from "./text";

/**
 * SHA-256 de empresa + título + descrição normalizados (minúsculas, sem acentos,
 * sem HTML, espaços colapsados). Detecta a mesma vaga publicada em URLs diferentes.
 */
export function contentHash(input: { company: string; title: string; description: string }): string {
  const parts = [input.company, input.title, input.description].map(normalizeForComparison);
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}
