import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

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

  const [profile, resumeCount, sources] = await Promise.all([
    prisma.candidateProfile.findUnique({ where: { userId: user.id } }),
    prisma.resume.count({ where: { userId: user.id } }),
    prisma.jobSource.findMany({ where: { enabled: true }, orderBy: { name: "asc" } }),
  ]);

  const firstName = user.name?.split(" ")[0] ?? "dev";

  const steps: { label: string; done: boolean; href?: string }[] = [
    { label: "Fazer login", done: true },
    { label: "Preencher o perfil", done: Boolean(profile), href: "/perfil" },
    { label: "Cadastrar o currículo", done: resumeCount > 0 },
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
