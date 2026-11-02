import type { Seniority, WorkMode } from "@/generated/prisma/enums";
import type { ConnectorQuery } from "@/server/connectors/types";
import { normalizeForComparison } from "./text";

export const MAX_JOBS_PER_RUN = 200;

export interface ProfileForQuery {
  targetRoles: string[];
  skills: string[];
  country: string;
  workModes: WorkMode[];
  /** Usada na busca da Gupy (termos com "júnior") e no filtro de relevância. Padrão: JUNIOR. */
  seniority?: Seniority;
}

/** Sugestão para quem ainda não preencheu o perfil: front-end júnior no Brasil. */
export const DEFAULT_PROFILE_FOR_QUERY: ProfileForQuery = {
  targetRoles: ["Desenvolvedor Front-end", "Front-end Developer"],
  skills: ["React", "TypeScript", "JavaScript", "Next.js"],
  country: "BR",
  workModes: ["REMOTE", "HYBRID"],
  seniority: "JUNIOR",
};

/**
 * A busca vem do perfil: cargos desejados + principais tecnologias como palavras-chave.
 * Palavras repetidas (sem diferenciar maiúsculas) entram uma vez só.
 */
export function buildQueryFromProfile(profile: ProfileForQuery): ConnectorQuery {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const word of [...profile.targetRoles.slice(0, 3), ...profile.skills.slice(0, 3)]) {
    const trimmed = word.trim();
    if (trimmed && !seen.has(trimmed.toLowerCase())) {
      seen.add(trimmed.toLowerCase());
      keywords.push(trimmed);
    }
  }
  return {
    keywords,
    country: profile.country || "BR",
    workModes: profile.workModes.length > 0 ? profile.workModes : undefined,
    maxResults: MAX_JOBS_PER_RUN,
  };
}

// ───────── Gupy: palavras-chave mais específicas ─────────

/** No máximo estes termos por coleta (cada um é uma busca; o teto de requisições segue 6). */
export const GUPY_MAX_KEYWORDS = 6;

/** Termo de nível que acompanha o cargo na busca ("front-end júnior"). */
const LEVEL_TERM: Record<Seniority, string | null> = { INTERN: "estágio", JUNIOR: "júnior", MID: "pleno", SENIOR: "sênior", LEAD: null };

/** Habilidades genéricas demais para buscar sozinhas (trazem back-end, QA etc.). */
export const GENERIC_SKILLS = new Set([
  "javascript", "typescript", "js", "ts", "html", "css", "html5", "css3", "git", "github", "sql", "node", "nodejs", "java", "python",
]);

/** "Desenvolvedor Front-end" → "Front-end": o núcleo do cargo, sem prefixos genéricos. */
const ROLE_PREFIX = /^(?:pessoa\s+)?(?:desenvolvedor(?:a)?|developer|engenheiro(?:a)?|analista|programador(?:a)?)\s+(?:de\s+)?/i;
const ROLE_SUFFIX = /\s+(?:developer|engineer|dev)$/i;

export function roleCore(role: string): string {
  return role.trim().replace(ROLE_PREFIX, "").replace(ROLE_SUFFIX, "").trim();
}

/** Chave para deduplicar: sem acento, maiúsculas, hífen ou espaço ("Front-end" = "frontend" = "front end"). */
export function keywordKey(term: string): string {
  return normalizeForComparison(term).replace(/[^a-z0-9#]+/g, "");
}

/**
 * Termos da Gupy, do mais específico ao mais amplo (até GUPY_MAX_KEYWORDS):
 *   "front-end júnior", cargos como escritos no perfil, "react júnior", "front-end", "react", "next.js júnior".
 * Habilidades genéricas (JavaScript, TypeScript…) não entram sozinhas.
 */
export function buildGupyKeywords(profile: Pick<ProfileForQuery, "targetRoles" | "skills" | "seniority">): string[] {
  const level = LEVEL_TERM[profile.seniority ?? "JUNIOR"];
  const roles = profile.targetRoles.map((r) => r.trim()).filter(Boolean);
  const specificSkills = profile.skills.map((s) => s.trim()).filter((s) => s && !GENERIC_SKILLS.has(keywordKey(s)));
  const core = roles[0] ? roleCore(roles[0]) : "";

  const candidates: string[] = [];
  if (core && level) candidates.push(`${core} ${level}`);
  candidates.push(...roles.slice(0, 2));
  if (specificSkills[0] && level) candidates.push(`${specificSkills[0]} ${level}`);
  if (core) candidates.push(core);
  if (specificSkills[0]) candidates.push(specificSkills[0]);
  if (specificSkills[1] && level) candidates.push(`${specificSkills[1]} ${level}`);
  if (specificSkills[1]) candidates.push(specificSkills[1]);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of candidates) {
    const key = keywordKey(term);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(term);
    if (out.length >= GUPY_MAX_KEYWORDS) break;
  }
  return out;
}

/** Consulta específica da Gupy (a do Remotive continua sendo buildQueryFromProfile). */
export function buildGupyQuery(profile: ProfileForQuery): ConnectorQuery {
  return {
    keywords: buildGupyKeywords(profile),
    country: profile.country || "BR",
    workModes: profile.workModes.length > 0 ? profile.workModes : undefined,
    maxResults: MAX_JOBS_PER_RUN,
  };
}
