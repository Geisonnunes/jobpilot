import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { SENIORITIES, WORK_MODES } from "@/lib/profile";
import { daysAgoLabel, isHttpUrl } from "@/server/jobs/list";
import { prefilterPosting } from "@/server/ai/prefilter";
import { PROMPT_VERSION } from "@/server/ai/match/prompts/match-v1";
import { EvaluateButton } from "./evaluate-button";
import { currentRecommendation } from "@/server/ai/match/view";
import { MatchPanel } from "./match-panel";

/** Detalhes de uma vaga. A descrição é texto puro: nunca é renderizada como HTML. */
export default function JobDetailPage({ params }: PageProps<"/vagas/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Carregando…</p>}>
      <JobDetail params={params} />
    </Suspense>
  );
}

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

async function JobDetail({ params }: { params: PageProps<"/vagas/[id]">["params"] }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) notFound();

  // Vagas manuais só aparecem para quem as adicionou.
  const job = await prisma.jobPosting.findFirst({
    where: { id, OR: [{ addedByUserId: null }, { addedByUserId: user.id }] },
    include: { source: { select: { name: true, slug: true } } },
  });
  if (!job) notFound();

  const [profile, resume] = await Promise.all([
    prisma.candidateProfile.findUnique({ where: { userId: user.id }, select: { excludeKeywords: true, seniority: true, workModes: true, minMatchScore: true } }),
    prisma.resume.findFirst({ where: { userId: user.id, isPrimary: true }, select: { id: true } }),
  ]);
  const match = resume
    ? await prisma.jobMatch.findUnique({
        where: { userId_postingId_resumeId_promptVersion: { userId: user.id, postingId: job.id, resumeId: resume.id, promptVersion: PROMPT_VERSION } },
        select: { id: true, score: true, recommendation: true, summary: true, dimensions: true, missingSkills: true, redFlags: true, promptVersion: true, model: true, createdAt: true },
      })
    : null;
  const prefilter = profile ? prefilterPosting(job, profile) : null;

  const now = new Date();
  const badges = [
    WORK_MODES.find((m) => m.value === job.workMode)?.label,
    SENIORITIES.find((s) => s.value === job.seniority)?.label,
    job.employmentType,
  ].filter(Boolean);

  return (
    <div className="max-w-3xl">
      <Link href="/vagas" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">← Voltar para as vagas</Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight break-words">{job.title}</h1>
      <p className="mt-1 text-zinc-600 break-words dark:text-zinc-400">
        {job.company}
        {job.location && ` · ${job.location}`}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
        {badges.map((b) => (
          <span key={b} className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">{b}</span>
        ))}
        <span>Fonte: {job.source.name}</span>
        {job.publishedAt && <span>Publicada {daysAgoLabel(job.publishedAt, now)}</span>}
        <span>Vista {daysAgoLabel(job.lastSeenAt, now)}</span>
        {job.addedByUserId && <span>Adicionada por você</span>}
      </div>

      {isHttpUrl(job.originalUrl) && (
        <a
          href={job.originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Ver anúncio original ↗
        </a>
      )}

      {match ? (
        <MatchPanel postingId={job.id} match={match} recommendation={currentRecommendation(match.score.toString(), profile?.minMatchScore.toString(), match.recommendation)} />
      ) : (
        <section aria-labelledby="match-title" className="mt-8 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 id="match-title" className="text-sm font-medium text-zinc-500 uppercase">Avaliação de compatibilidade</h2>
          {!profile ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              Para avaliar, <Link href="/perfil" className="text-emerald-700 underline dark:text-emerald-400">preencha o seu perfil</Link>.
            </p>
          ) : !resume ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              Para avaliar, <Link href="/curriculo" className="text-emerald-700 underline dark:text-emerald-400">cadastre um currículo e marque-o como principal</Link>.
            </p>
          ) : prefilter && !prefilter.pass ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              <span className="font-medium">Descartada no pré-filtro:</span> {prefilter.reason} Nenhuma chamada de IA é feita para esta vaga.
            </p>
          ) : (
            <div className="mt-3">
              <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
                Ainda não avaliada. A IA compara a vaga com o seu perfil e o seu currículo principal (sem e-mail, telefone, endereço ou links).
              </p>
              <EvaluateButton postingId={job.id} reevaluate={false} />
            </div>
          )}
        </section>
      )}

      <h2 className="mt-8 text-sm font-medium text-zinc-500 uppercase">Descrição</h2>
      {job.description ? (
        <div className="mt-3 rounded-xl border border-zinc-200 p-4 text-sm leading-relaxed break-words whitespace-pre-wrap dark:border-zinc-800">
          {job.description}
        </div>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">Esta vaga não trouxe descrição. Abra o anúncio original para ver os detalhes.</p>
      )}

      <p className="mt-4 text-xs text-zinc-500">Primeira vez vista em {dateTime.format(job.firstSeenAt)}.</p>
    </div>
  );
}
