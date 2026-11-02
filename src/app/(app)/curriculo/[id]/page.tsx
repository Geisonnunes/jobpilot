import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { resumeIdSchema } from "@/lib/resume";

/** Visualização somente leitura de uma versão do currículo. */
export default function ResumeViewPage({ params }: PageProps<"/curriculo/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Carregando…</p>}>
      <ResumeView params={params} />
    </Suspense>
  );
}

async function ResumeView({ params }: { params: PageProps<"/curriculo/[id]">["params"] }) {
  const user = await requireUser();
  const { id } = await params;
  if (!resumeIdSchema.safeParse(id).success) notFound();

  // Sempre filtra pelo dono: o id sozinho nunca basta.
  const resume = await prisma.resume.findFirst({
    where: { id, userId: user.id },
    select: { label: true, version: true, isPrimary: true, rawText: true, updatedAt: true },
  });
  if (!resume) notFound();

  return (
    <div className="max-w-3xl">
      <Link href="/curriculo" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
        ← Voltar para os currículos
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight break-words">{resume.label}</h1>
        <span className="text-zinc-500">versão {resume.version}</span>
        {resume.isPrimary && (
          <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">Principal</span>
        )}
      </div>
      <p className="mt-1 text-sm text-zinc-500">{resume.rawText.length.toLocaleString("pt-BR")} caracteres · somente leitura</p>
      <pre className="mt-6 rounded-xl border border-zinc-200 p-4 font-mono text-sm leading-relaxed break-words whitespace-pre-wrap dark:border-zinc-800">
        {resume.rawText}
      </pre>
    </div>
  );
}
