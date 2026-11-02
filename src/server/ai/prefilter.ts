import type { PostingStatus, Seniority, WorkMode } from "@/generated/prisma/enums";
import { toUf } from "@/lib/states";
import { SENIORITY_ORDER } from "@/server/jobs/infer";
import { normalizeForComparison } from "@/server/jobs/text";

/**
 * Pré-filtro sem IA (funções puras). Vagas barradas aqui não gastam chamada de IA.
 * O motivo é recalculado sempre que a vaga é exibida, então nunca fica desatualizado
 * em relação ao perfil.
 */

export const MIN_DESCRIPTION_CHARS = 200;

export interface PrefilterPosting {
  status: PostingStatus;
  title: string;
  description: string;
  seniority: Seniority | null;
  workMode: WorkMode | null;
  /** Estado da vaga: sigla ("SP") ou por extenso ("São Paulo", como a Gupy envia). */
  state?: string | null;
}

export interface PrefilterProfile {
  excludeKeywords: string[];
  seniority: Seniority;
  workModes: WorkMode[];
  /** UF do perfil ("SP"). Sem UF, a região não é verificada. */
  state?: string | null;
}

export type PrefilterResult = { pass: true } | { pass: false; code: PrefilterCode; reason: string };
export type PrefilterCode = "CLOSED" | "EXCLUDED_KEYWORD" | "SENIORITY_ABOVE" | "WORK_MODE" | "NO_DESCRIPTION" | "REGION";

const MODE_LABEL: Record<WorkMode, string> = { REMOTE: "remoto", HYBRID: "híbrido", ONSITE: "presencial" };
const LEVEL_LABEL: Record<Seniority, string> = { INTERN: "estágio", JUNIOR: "júnior", MID: "pleno", SENIOR: "sênior", LEAD: "lead" };

export function prefilterPosting(posting: PrefilterPosting, profile: PrefilterProfile): PrefilterResult {
  if (posting.status === "CLOSED") {
    return { pass: false, code: "CLOSED", reason: "Vaga encerrada." };
  }

  const title = normalizeForComparison(posting.title);
  for (const raw of profile.excludeKeywords) {
    const keyword = normalizeForComparison(raw.trim());
    if (keyword && title.includes(keyword)) {
      return { pass: false, code: "EXCLUDED_KEYWORD", reason: `O título contém a palavra excluída “${raw.trim()}”.` };
    }
  }

  if (posting.seniority && SENIORITY_ORDER.indexOf(posting.seniority) > SENIORITY_ORDER.indexOf(profile.seniority)) {
    return {
      pass: false,
      code: "SENIORITY_ABOVE",
      reason: `Senioridade da vaga (${LEVEL_LABEL[posting.seniority]}) acima da desejada (${LEVEL_LABEL[profile.seniority]}).`,
    };
  }

  if (posting.workMode && profile.workModes.length > 0 && !profile.workModes.includes(posting.workMode)) {
    return { pass: false, code: "WORK_MODE", reason: `Modalidade ${MODE_LABEL[posting.workMode]} não está entre as que você aceita.` };
  }

  // Presencial/híbrida em outra UF: fora da região. Remota não é afetada; sem UF (na vaga ou no perfil), não descarta.
  if (posting.workMode === "HYBRID" || posting.workMode === "ONSITE") {
    const jobUf = toUf(posting.state);
    const myUf = toUf(profile.state);
    if (jobUf && myUf && jobUf !== myUf) {
      return { pass: false, code: "REGION", reason: `Fora da sua região (vaga em ${jobUf}; você está em ${myUf}).` };
    }
  }

  if (posting.description.trim().length < MIN_DESCRIPTION_CHARS) {
    return { pass: false, code: "NO_DESCRIPTION", reason: `Descrição curta demais para avaliar (menos de ${MIN_DESCRIPTION_CHARS} caracteres).` };
  }

  return { pass: true };
}
