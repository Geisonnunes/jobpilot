import type { WorkMode } from "@/generated/prisma/enums";
import type { ConnectorQuery } from "@/server/connectors/types";

export const MAX_JOBS_PER_RUN = 200;

export interface ProfileForQuery {
  targetRoles: string[];
  skills: string[];
  country: string;
  workModes: WorkMode[];
}

/** Sugestão para quem ainda não preencheu o perfil: front-end júnior no Brasil. */
export const DEFAULT_PROFILE_FOR_QUERY: ProfileForQuery = {
  targetRoles: ["Desenvolvedor Front-end", "Front-end Developer"],
  skills: ["React", "TypeScript", "JavaScript", "Next.js"],
  country: "BR",
  workModes: ["REMOTE", "HYBRID"],
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
