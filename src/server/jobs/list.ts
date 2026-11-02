import type { Prisma } from "@/generated/prisma/client";
import type { Seniority, WorkMode } from "@/generated/prisma/enums";
import { SENIORITY_ORDER } from "./infer";

/** Filtros da tela /vagas e a montagem do `where` do Prisma (funções puras). */

export const PAGE_SIZE = 20;

const WORK_MODES: WorkMode[] = ["REMOTE", "HYBRID", "ONSITE"];
const STATUSES = ["OPEN", "CLOSED", "UNKNOWN", "ALL"] as const;
type StatusFilter = (typeof STATUSES)[number];

export interface JobFilters {
  q: string;
  source: string;
  mode: WorkMode | "";
  level: Seniority | "";
  status: StatusFilter;
  /** "Compatíveis com meu perfil": ligado por padrão. */
  compat: boolean;
  /** "recent" (padrão) ou "score": ordena pela nota da avaliação de IA. */
  sort: "recent" | "score";
  /** "Somente recomendadas": avaliações APPLY. */
  recommended: boolean;
  page: number;
}

type RawParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseFilters(params: RawParams): JobFilters {
  const mode = first(params.mode);
  const level = first(params.level);
  const status = first(params.status);
  const page = Number.parseInt(first(params.page), 10);
  return {
    q: first(params.q).trim().slice(0, 100),
    source: /^[a-z0-9-]{1,40}$/.test(first(params.source)) ? first(params.source) : "",
    mode: (WORK_MODES as string[]).includes(mode) ? (mode as WorkMode) : "",
    level: (SENIORITY_ORDER as string[]).includes(level) ? (level as Seniority) : "",
    status: (STATUSES as readonly string[]).includes(status) ? (status as StatusFilter) : "OPEN",
    compat: first(params.compat) !== "0",
    sort: first(params.sort) === "score" ? "score" : "recent",
    recommended: first(params.recommended) === "1",
    page: Number.isInteger(page) && page > 0 ? Math.min(page, 10_000) : 1,
  };
}

export interface ProfileForFilter {
  excludeKeywords: string[];
  seniority: Seniority;
}

/**
 * Monta o filtro do banco. Vagas coletadas são de todos; vagas manuais só do dono.
 * "Compatíveis": esconde vagas cujo TÍTULO contém uma palavra de exclusão ou cuja
 * senioridade é maior que a desejada (vagas sem senioridade definida continuam aparecendo).
 */
export function buildJobsWhere(
  filters: JobFilters,
  userId: string,
  profile: ProfileForFilter | null,
  /** CV principal + versão do prompt: define quais avaliações contam em "Somente recomendadas". */
  matchScope?: { resumeId: string; promptVersion: string },
): Prisma.JobPostingWhereInput {
  const and: Prisma.JobPostingWhereInput[] = [{ OR: [{ addedByUserId: null }, { addedByUserId: userId }] }];

  if (filters.q) {
    and.push({ OR: [{ title: { contains: filters.q, mode: "insensitive" } }, { company: { contains: filters.q, mode: "insensitive" } }] });
  }
  if (filters.source) and.push({ source: { slug: filters.source } });
  if (filters.mode) and.push({ workMode: filters.mode });
  if (filters.level) and.push({ seniority: filters.level });
  if (filters.status !== "ALL") and.push({ status: filters.status });
  if (filters.recommended) {
    // Sem CV principal não há avaliação válida: a lista fica vazia (e não mostra tudo por engano).
    and.push(
      matchScope
        ? { matches: { some: { userId, resumeId: matchScope.resumeId, promptVersion: matchScope.promptVersion, recommendation: "APPLY" } } }
        : { id: "" },
    );
  }

  if (filters.compat && profile) {
    const keywords = profile.excludeKeywords.map((k) => k.trim()).filter(Boolean);
    if (keywords.length > 0) and.push({ NOT: { OR: keywords.map((k) => ({ title: { contains: k, mode: "insensitive" as const } })) } });
    const allowed = SENIORITY_ORDER.slice(0, SENIORITY_ORDER.indexOf(profile.seniority) + 1);
    and.push({ OR: [{ seniority: null }, { seniority: { in: allowed } }] });
  }
  return { AND: and };
}

/** Querystring a partir dos filtros (omite os valores padrão). */
export function filtersToQuery(filters: JobFilters, overrides: Partial<JobFilters> = {}): string {
  const f = { ...filters, ...overrides };
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.source) p.set("source", f.source);
  if (f.mode) p.set("mode", f.mode);
  if (f.level) p.set("level", f.level);
  if (f.status !== "OPEN") p.set("status", f.status);
  if (!f.compat) p.set("compat", "0");
  if (f.sort === "score") p.set("sort", "score");
  if (f.recommended) p.set("recommended", "1");
  if (f.page > 1) p.set("page", String(f.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** "hoje", "ontem", "há 3 dias"… */
export function daysAgoLabel(date: Date, now: Date): string {
  const days = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
  if (days === 0) return "hoje";
  if (days === 1) return "ontem";
  return `há ${days} dias`;
}

/** Só links http(s) viram <a>: o texto vem de fontes externas. */
export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}
