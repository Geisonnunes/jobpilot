import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { MatchBadge } from "@/components/match-badge";
import { PROMPT_VERSION } from "@/server/ai/match/prompts/match-v1";
import { currentRecommendation } from "@/server/ai/match/view";

/**
 * Página síncrona: a leitura da sessão e do banco acontece em DashboardContent,
 * dentro do próprio <Suspense> da página. O Suspense do layout não cobre
 * navegações do cliente, pois fica acima do ponto de re-renderização.
 */
export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Carregando…</p>}>
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  const user = await requireUser();

  const [profile, resumeCount, sources, primaryResume] = await Promise.all([
    prisma.candidateProfile.findUnique({ where: { userId: user.id } }),
    prisma.resume.count({ where: { userId: user.id } }),
    prisma.jobSource.findMany({ where: { enabled: true }, orderBy: { name: "asc" } }),
    prisma.resume.findFirst({ where: { userId: user.id, isPrimary: true }, select: { id: true } }),
  ]);

  // Melhores vagas: 5 maiores notas (CV principal + versão atual do prompt), só de vagas ainda abertas.
  const topMatches = primaryResume
    ? await prisma.jobMatch.findMany({
        where: { userId: user.id, resumeId: primaryResume.id, promptVersion: PROMPT_VERSION, posting: { status: { not: "CLOSED" } } },
        orderBy: [{ score: "desc" }, { createdAt: "desc" }],
        take: 5,
        select: { score: true, recommendation: true, posting: { select: { id: true, title: true, company: true } } },
      })
    : [];

  const firstName = user.name?.split(" ")[0] ?? "dev";

  const steps: { label: string; done: boolean; href?: string }[] = [
    { label: "Fazer login", done: true },
    { label: "Preencher o perfil", done: Boolean(profile), href: "/perfil" },
    { label: "Cadastrar o currículo", done: resumeCount > 0, href: "/curriculo" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Olá, {firstName} 👋</h1>
      <p className="mt-1 text-zinc-600 dark:text-zinc-400">
        Complete os passos abaixo para o JobPilot começar a buscar vagas para você.
      </p>

      <ul className="mt-8 space-y-2">
        {steps.map((s) => (
          <li
            key={s.label}
            className="flex items-center gap-3 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
          >
            <span
              className={
                s.done
                  ? "flex size-5 items-center justify-center rounded-full bg-emerald-600 text-xs text-white"
                  : "size-5 rounded-full border-2 border-zinc-300 dark:border-zinc-700"
              }
            >
              {s.done ? "✓" : ""}
            </span>
            {s.href ? (
              <Link
                href={s.href}
                className={`hover:underline ${s.done ? "text-zinc-500 line-through" : "text-emerald-700 dark:text-emerald-400"}`}
              >
                {s.label}
              </Link>
            ) : (
              <span className={s.done ? "text-zinc-500 line-through" : ""}>{s.label}</span>
            )}
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-sm font-medium text-zinc-500 uppercase">Melhores vagas</h2>
      {topMatches.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Nenhuma vaga avaliada ainda. Abra uma vaga em{" "}
          <Link href="/vagas" className="text-emerald-700 underline dark:text-emerald-400">Vagas</Link> e clique em “Avaliar compatibilidade”.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {topMatches.map((m) => (
            <li key={m.posting.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <Link href={`/vagas/${m.posting.id}`} className="font-medium break-words hover:underline">{m.posting.title}</Link>
                <p className="text-sm break-words text-zinc-600 dark:text-zinc-400">{m.posting.company}</p>
              </div>
              <div className="shrink-0">
                <MatchBadge score={Number(m.score)} recommendation={currentRecommendation(m.score.toString(), profile?.minMatchScore.toString(), m.recommendation)} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10 text-sm font-medium text-zinc-500 uppercase">Fontes de vagas ativas</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {sources.map((s) => (
          <span
            key={s.id}
            className="rounded-full bg-zinc-100 px-3 py-1 text-sm dark:bg-zinc-800"
          >
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
