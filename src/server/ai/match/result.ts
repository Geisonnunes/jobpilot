import { z } from "zod";

/**
 * Validação da resposta da IA e pós-processamento no código (funções puras):
 * extração do JSON, schema Zod, verificação de evidências e recálculo da recomendação.
 */

const dimension = z.object({
  score: z.number().min(1).max(5),
  reason: z.string().trim().min(1).max(600),
});

export const matchResultSchema = z.object({
  score: z.number().min(1).max(5).transform((n) => Math.round(n * 10) / 10),
  recommendation: z.enum(["APPLY", "MAYBE", "SKIP"]),
  dimensions: z.object({
    cvMatch: dimension,
    goalAlignment: dimension,
    compensation: dimension,
    location: dimension,
    redFlags: dimension,
  }),
  summary: z.string().trim().min(1).max(900),
  matchedSkills: z.array(z.object({ skill: z.string().trim().min(1).max(100), evidence: z.string().trim().min(1).max(500) })).max(40),
  missingSkills: z.array(z.string().trim().min(1).max(150)).max(40),
  redFlags: z.array(z.string().trim().min(1).max(300)).max(20),
});

export type MatchResult = z.infer<typeof matchResultSchema>;
export type Recommendation = MatchResult["recommendation"];

/** Pega o objeto JSON da resposta, tolerando cercas de markdown e texto em volta. */
export function extractJsonObject(text: string): unknown {
  const unfenced = text.replace(/```(?:json)?/gi, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("A resposta não contém um objeto JSON.");
  return JSON.parse(unfenced.slice(start, end + 1));
}

export type ParseOutcome = { ok: true; result: MatchResult } | { ok: false; problem: string };

/** Problema descrito de forma genérica: nunca ecoa o conteúdo da resposta. */
export function parseMatchResponse(text: string): ParseOutcome {
  let raw: unknown;
  try {
    raw = extractJsonObject(text);
  } catch {
    return { ok: false, problem: "não era um JSON válido." };
  }
  const parsed = matchResultSchema.safeParse(raw);
  if (parsed.success) return { ok: true, result: parsed.data };
  const fields = [...new Set(parsed.error.issues.map((i) => i.path.join(".") || "(raiz)"))].slice(0, 6);
  return { ok: false, problem: `o JSON não segue o formato (campos com problema: ${fields.join(", ")}).` };
}

/** Minúsculas + espaços colapsados + aspas tipográficas simplificadas. */
export function normalizeEvidence(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export interface EvidenceCheck {
  matchedSkills: MatchResult["matchedSkills"];
  removed: number;
  /** Mais da metade das evidências era inventada. */
  suspect: boolean;
}

/** Mantém só as evidências que existem literalmente no CV (o texto que a IA recebeu). */
export function verifyEvidence(matched: MatchResult["matchedSkills"], resumeText: string): EvidenceCheck {
  const haystack = normalizeEvidence(resumeText);
  const kept = matched.filter((m) => {
    const needle = normalizeEvidence(m.evidence);
    return needle.length >= 3 && haystack.includes(needle);
  });
  const removed = matched.length - kept.length;
  return { matchedSkills: kept, removed, suspect: matched.length > 0 && removed > matched.length / 2 };
}

export const SUSPECT_NOTICE = "⚠ Avaliação suspeita: mais da metade das evidências citadas não existe no currículo.";

/** APPLY se nota >= mínimo; MAYBE se >= mínimo − 1; senão SKIP. */
export function recommendationFor(score: number, minMatchScore: number): Recommendation {
  // Compara em décimos para evitar erro de ponto flutuante (3.0 vs 3.0000001).
  const s = Math.round(score * 10);
  const min = Math.round(minMatchScore * 10);
  if (s >= min) return "APPLY";
  if (s >= min - 10) return "MAYBE";
  return "SKIP";
}
