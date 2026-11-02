import { recommendationFor, type Recommendation } from "./result";

/** Leitura segura do JSON salvo em JobMatch.dimensions (funções puras). */

export const DIMENSION_LABELS = {
  cvMatch: "Aderência ao currículo",
  goalAlignment: "Alinhamento com seus objetivos",
  compensation: "Remuneração",
  location: "Local e modalidade",
  redFlags: "Alertas (5 = nenhum)",
} as const;

export type DimensionKey = keyof typeof DIMENSION_LABELS;

export interface StoredDimensions {
  dimensions: Array<{ key: DimensionKey; label: string; score: number; reason: string }>;
  matchedSkills: Array<{ skill: string; evidence: string }>;
  evidenceRemoved: number;
  suspect: boolean;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseStoredDimensions(json: unknown): StoredDimensions {
  const root = isRecord(json) ? json : {};
  const dimensions = (Object.keys(DIMENSION_LABELS) as DimensionKey[]).flatMap((key) => {
    const d = root[key];
    if (!isRecord(d) || typeof d.score !== "number" || typeof d.reason !== "string") return [];
    return [{ key, label: DIMENSION_LABELS[key], score: d.score, reason: d.reason }];
  });
  const matchedSkills = Array.isArray(root.matchedSkills)
    ? root.matchedSkills.flatMap((m) => (isRecord(m) && typeof m.skill === "string" && typeof m.evidence === "string" ? [{ skill: m.skill, evidence: m.evidence }] : []))
    : [];
  return {
    dimensions,
    matchedSkills,
    evidenceRemoved: typeof root.evidenceRemoved === "number" ? root.evidenceRemoved : 0,
    suspect: root.suspect === true,
  };
}

export const RECOMMENDATION_LABEL = { APPLY: "Candidatar-se", MAYBE: "Talvez", SKIP: "Pular" } as const;

/** Nota mínima padrão do perfil (o mesmo default do schema), usada só se não houver perfil. */
export const DEFAULT_MIN_MATCH_SCORE = 4.0;

/**
 * Recomendação exibida: sempre calculada da nota com a nota mínima ATUAL do perfil.
 * A recomendação gravada em JobMatch é só histórico. Sem perfil, cai para a gravada.
 */
export function currentRecommendation(score: number | string, minMatchScore: number | string | null | undefined, stored: Recommendation): Recommendation {
  if (minMatchScore === null || minMatchScore === undefined) return stored;
  const min = Number(minMatchScore);
  const s = Number(score);
  if (!Number.isFinite(min) || !Number.isFinite(s)) return stored;
  return recommendationFor(s, min);
}
