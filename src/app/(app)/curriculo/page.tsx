import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { ResumeForm } from "./resume-form";
import { ResumeGroupList, type ResumeGroup } from "./resume-list";

/**
 * Página síncrona: sessão, banco e searchParams são lidos em CurriculoContent,
 * dentro do <Suspense> da própria página.
 */
export default function CurriculoPage({ searchParams }: PageProps<"/curriculo">) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Carregando…</p>}>
      <CurriculoContent searchParams={searchParams} />
    </Suspense>
  );
}

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

async function CurriculoContent({ searchParams }: { searchParams: PageProps<"/curriculo">["searchParams"] }) {
  const user = await requireUser();
  const { base } = await searchParams;
  const baseId = typeof base === "string" ? base : undefined;

  const resumes = await prisma.resume.findMany({
    where: { userId: user.id },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      label: true,
      version: true,
      isPrimary: true,
      rawText: true,
      updatedAt: true,
      createdAt: true,
      _count: { select: { matches: true, generatedDocuments: true, applications: true } },
    },
  });

  // Grupos por nome; versões em ordem decrescente. O texto completo não vai ao cliente.
  const groups = new Map<string, ResumeGroup>();
  for (const r of resumes) {
    const key = r.label.toLowerCase();
    const group = groups.get(key) ?? { label: r.label, versions: [] };
    group.versions.push({
      id: r.id,
      version: r.version,
      isPrimary: r.isPrimary,
      chars: r.rawText.length,
      updatedAt: dateFormat.format(r.updatedAt),
      matches: r._count.matches,
      documents: r._count.generatedDocuments,
      applications: r._count.applications,
    });
    groups.set(key, group);
  }
  const groupList = [...groups.values()].map((g) => ({
    ...g,
    versions: g.versions.sort((a, b) => b.version - a.version),
  }));

  // "Nova versão": o formulário abre com o nome e o texto da versão escolhida.
  const baseResume = baseId ? resumes.find((r) => r.id === baseId) : undefined;
  const existingLabels = groupList.map((g) => ({
    label: g.label,
    nextVersion: Math.max(...g.versions.map((v) => v.version)) + 1,
  }));

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Currículos</h1>
      <p className="mt-1 text-zinc-600 dark:text-zinc-400">
        O currículo é a fonte da verdade do JobPilot: a IA só usa o que está escrito aqui para avaliar vagas, sem
        inventar informações. Guardamos apenas o texto, não o arquivo PDF.
      </p>

      <h2 className="mt-8 text-sm font-medium text-zinc-500 uppercase">Seus currículos</h2>
      <div className="mt-3">
        {groupList.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-8 text-center dark:border-zinc-700">
            <p className="font-medium">Você ainda não cadastrou nenhum currículo.</p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Cole o texto do seu CV ou envie um PDF no formulário abaixo. O primeiro currículo vira o principal
              automaticamente.
            </p>
          </div>
        ) : (
          <ResumeGroupList groups={groupList} />
        )}
      </div>

      <section id="novo" className="mt-10 scroll-mt-6">
        <h2 className="text-sm font-medium text-zinc-500 uppercase">
          {baseResume ? "Nova versão" : "Adicionar currículo"}
        </h2>
        <ResumeForm
          // A chave remonta o formulário quando muda a versão-base escolhida.
          key={baseResume?.id ?? "novo"}
          initialLabel={baseResume?.label ?? ""}
          initialText={baseResume?.rawText ?? ""}
          fromVersion={baseResume ? { label: baseResume.label, version: baseResume.version } : null}
          existingLabels={existingLabels}
        />
      </section>
    </div>
  );
}
