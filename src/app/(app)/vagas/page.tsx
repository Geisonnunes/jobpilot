import { Suspense } from "react";
import Form from "next/form";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { SENIORITIES, WORK_MODES } from "@/lib/profile";
import { buildJobsWhere, daysAgoLabel, filtersToQuery, isHttpUrl, PAGE_SIZE, parseFilters } from "@/server/jobs/list";
import { MatchBadge } from "@/components/match-badge";
import { prefilterPosting } from "@/server/ai/prefilter";
import { PROMPT_VERSION } from "@/server/ai/match/prompts/match-v1";
import { currentRecommendation } from "@/server/ai/match/view";
import { ScanButton } from "./scan-button";

/**
 * Página síncrona: sessão, banco e searchParams são lidos em VagasContent,
 * dentro do <Suspense> da própria página.
 */
export default function VagasPage({ searchParams }: PageProps<"/vagas">) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Carregando…</p>}>
      <VagasContent searchParams={searchParams} />
    </Suspense>
  );
}

const STATUS_LABEL = { SUCCESS: "Sucesso", PARTIAL: "Parcial", FAILED: "Falhou", RUNNING: "Em andamento" } as const;
const STATUS_STYLE = {
  SUCCESS: "text-emerald-700 dark:text-emerald-400",
  PARTIAL: "text-amber-700 dark:text-amber-400",
  FAILED: "text-red-600 dark:text-red-400",
  RUNNING: "text-zinc-500",
} as const;

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const modeLabel = (m: string | null) => WORK_MODES.find((x) => x.value === m)?.label;
const levelLabel = (s: string | null) => SENIORITIES.find((x) => x.value === s)?.label;

const selectClass =
  "block w-full min-w-0 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

async function VagasContent({ searchParams }: { searchParams: PageProps<"/vagas">["searchParams"] }) {
  const user = await requireUser();
  const filters = parseFilters(await searchParams);

  const [profile, resume] = await Promise.all([
    prisma.candidateProfile.findUnique({
      where: { userId: user.id },
      select: { excludeKeywords: true, seniority: true, workModes: true, minMatchScore: true, state: true },
    }),
    prisma.resume.findFirst({ where: { userId: user.id, isPrimary: true }, select: { id: true } }),
  ]);
  const minMatchScore = profile ? Number(profile.minMatchScore) : null;
  const scope = resume ? { resumeId: resume.id, promptVersion: PROMPT_VERSION, minMatchScore: minMatchScore ?? 4.0 } : undefined;
  const where = buildJobsWhere(filters, user.id, profile, scope);

  // Avaliações válidas (CV principal + versão atual do prompt) deste usuário, por vaga.
  const matchRows = resume
    ? await prisma.jobMatch.findMany({
        where: { userId: user.id, resumeId: resume.id, promptVersion: PROMPT_VERSION },
        select: { postingId: true, score: true, recommendation: true },
      })
    : [];
  // Recomendação sempre da nota + nota mínima ATUAL do perfil; a gravada é só histórico.
  const matches = new Map(
    matchRows.map((m) => [m.postingId, { score: Number(m.score), recommendation: currentRecommendation(m.score.toString(), minMatchScore, m.recommendation) }]),
  );

  const jobSelect = {
    id: true, title: true, company: true, location: true, workMode: true, seniority: true,
    originalUrl: true, publishedAt: true, lastSeenAt: true, addedByUserId: true, status: true, description: true, state: true,
    source: { select: { name: true } },
  } as const;
  const defaultOrder = [{ publishedAt: { sort: "desc" as const, nulls: "last" as const } }, { firstSeenAt: "desc" as const }];

  // Ordenar por nota: a nota vive em outra tabela, então ordenamos os ids em memória e paginamos.
  async function loadPage() {
    if (filters.sort !== "score") {
      return prisma.jobPosting.findMany({ where, orderBy: defaultOrder, skip: (filters.page - 1) * PAGE_SIZE, take: PAGE_SIZE, select: jobSelect });
    }
    const all = await prisma.jobPosting.findMany({ where, orderBy: defaultOrder, select: { id: true } });
    const ordered = all
      .map((j, index) => ({ id: j.id, index, score: matches.get(j.id)?.score ?? -1 }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice((filters.page - 1) * PAGE_SIZE, filters.page * PAGE_SIZE)
      .map((j) => j.id);
    const rows = await prisma.jobPosting.findMany({ where: { id: { in: ordered } }, select: jobSelect });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ordered.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  }

  const [sources, total, totalAll, jobs, runs] = await Promise.all([
    prisma.jobSource.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } }),
    prisma.jobPosting.count({ where }),
    prisma.jobPosting.count({ where: buildJobsWhere({ ...filters, q: "", source: "", mode: "", level: "", status: "ALL", compat: false, recommended: false }, user.id, null) }),
    loadPage(),
    prisma.scanRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 6,
      select: {
        id: true, startedAt: true, status: true, fetchedCount: true, newCount: true, updatedCount: true,
        duplicateCount: true, errorCount: true, source: { select: { name: true } },
      },
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const now = new Date();
  const hasFilters = Boolean(filters.q || filters.source || filters.mode || filters.level || filters.recommended);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Vagas</h1>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">Vagas coletadas das fontes permitidas e as que você adicionou.</p>
        </div>
        <Link href="/vagas/nova" className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900">
          Adicionar vaga manual
        </Link>
      </div>

      <div className="mt-6">
        <ScanButton />
      </div>

      <Form action="/vagas" className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-3">
          <label htmlFor="q" className="sr-only">Buscar por título ou empresa</label>
          <input
            id="q" name="q" type="search" defaultValue={filters.q} placeholder="Buscar por título ou empresa"
            className="block w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
          />
        </div>
        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">Fonte</span>
          <select name="source" defaultValue={filters.source} className={selectClass}>
            <option value="">Todas</option>
            {sources.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">Modalidade</span>
          <select name="mode" defaultValue={filters.mode} className={selectClass}>
            <option value="">Todas</option>
            {WORK_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">Senioridade</span>
          <select name="level" defaultValue={filters.level} className={selectClass}>
            <option value="">Todas</option>
            {SENIORITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">Status</span>
          <select name="status" defaultValue={filters.status} className={selectClass}>
            <option value="OPEN">Abertas</option>
            <option value="CLOSED">Encerradas</option>
            <option value="UNKNOWN">Desconhecido</option>
            <option value="ALL">Todas</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">Compatíveis com meu perfil</span>
          <select name="compat" defaultValue={filters.compat ? "1" : "0"} className={selectClass}>
            <option value="1">Sim</option>
            <option value="0">Não, mostrar todas</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">Ordenar por</span>
          <select name="sort" defaultValue={filters.sort} className={selectClass}>
            <option value="recent">Mais recentes</option>
            <option value="score">Maior nota</option>
          </select>
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" name="recommended" value="1" defaultChecked={filters.recommended} className="size-4 accent-emerald-600" />
          <span>Somente recomendadas</span>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
            Filtrar
          </button>
          <Link href="/vagas" className="rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
            Limpar
          </Link>
        </div>
      </Form>

      <p className="mt-6 text-sm text-zinc-500" aria-live="polite">
        {total} vaga(s)
        {filters.compat && !profile && " · preencha o perfil para filtrar por compatibilidade"}
      </p>

      {jobs.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-zinc-300 px-6 py-8 text-center dark:border-zinc-700">
          {totalAll === 0 ? (
            <>
              <p className="font-medium">Ainda não há vagas por aqui.</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Clique em “Buscar vagas agora” para coletar da Gupy e do Remotive, ou{" "}
                <Link href="/vagas/nova" className="text-emerald-700 underline dark:text-emerald-400">adicione uma vaga manualmente</Link>.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">Nenhuma vaga encontrada com esses filtros.</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {filters.compat && !hasFilters
                  ? "O filtro “Compatíveis com meu perfil” pode estar escondendo vagas (palavras excluídas ou senioridade acima da desejada)."
                  : "Tente limpar os filtros."}{" "}
                <Link href={`/vagas${filtersToQuery(filters, { compat: false, page: 1 })}`} className="text-emerald-700 underline dark:text-emerald-400">
                  Mostrar todas
                </Link>
              </p>
            </>
          )}
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {jobs.map((job) => {
            const published = job.publishedAt
              ? `Publicada ${daysAgoLabel(job.publishedAt, now)}`
              : `Vista ${daysAgoLabel(job.lastSeenAt, now)}`;
            const badges = [modeLabel(job.workMode), levelLabel(job.seniority)].filter(Boolean);
            const match = matches.get(job.id);
            const pre = !match && profile ? prefilterPosting(job, profile) : null;
            return (
              <li key={job.id} className="px-4 py-3">
                <Link href={`/vagas/${job.id}`} className="font-medium break-words hover:underline">{job.title}</Link>
                <p className="mt-0.5 text-sm text-zinc-600 break-words dark:text-zinc-400">
                  {job.company}
                  {job.location && ` · ${job.location}`}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                  {match ? (
                    <MatchBadge score={match.score} recommendation={match.recommendation} />
                  ) : pre && !pre.pass ? (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" title={pre.reason}>
                      Descartada: {pre.reason}
                    </span>
                  ) : (
                    <span className="rounded-full border border-dashed border-zinc-300 px-2 py-0.5 dark:border-zinc-700">Não avaliada</span>
                  )}
                  {badges.map((b) => (
                    <span key={b} className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">{b}</span>
                  ))}
                  <span>Fonte: {job.source.name}</span>
                  <span>{published}</span>
                  {isHttpUrl(job.originalUrl) && (
                    <a href={job.originalUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-700 hover:underline dark:text-emerald-400">
                      Ver anúncio original ↗
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Paginação" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          {filters.page > 1 ? (
            <Link href={`/vagas${filtersToQuery(filters, { page: filters.page - 1 })}`} className="rounded-lg border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900">← Anterior</Link>
          ) : <span />}
          <span className="text-zinc-500">Página {Math.min(filters.page, pages)} de {pages}</span>
          {filters.page < pages ? (
            <Link href={`/vagas${filtersToQuery(filters, { page: filters.page + 1 })}`} className="rounded-lg border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900">Próxima →</Link>
          ) : <span />}
        </nav>
      )}

      <h2 className="mt-10 text-sm font-medium text-zinc-500 uppercase">Últimas coletas</h2>
      {runs.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">Nenhuma coleta ainda.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {runs.map((r) => (
            <li key={r.id} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
              <span className="font-medium">{r.source.name}</span>
              <span className="text-zinc-500"> · {dateTime.format(r.startedAt)} · </span>
              <span className={STATUS_STYLE[r.status]}>{STATUS_LABEL[r.status]}</span>
              <p className="mt-0.5 text-xs text-zinc-500">
                {r.fetchedCount} lida(s) · {r.newCount} nova(s) · {r.updatedCount} atualizada(s) · {r.duplicateCount} duplicada(s) · {r.errorCount} erro(s)
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
