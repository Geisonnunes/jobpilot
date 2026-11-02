import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { ManualJobForm } from "./manual-job-form";

/** Página síncrona: a sessão é lida em NovaVagaContent, dentro do <Suspense>. */
export default function NovaVagaPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Carregando…</p>}>
      <NovaVagaContent />
    </Suspense>
  );
}

async function NovaVagaContent() {
  await requireUser();
  return (
    <div className="max-w-2xl">
      <Link href="/vagas" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">← Voltar para as vagas</Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Adicionar vaga manualmente</h1>
      <p className="mt-1 text-zinc-600 dark:text-zinc-400">
        Para vagas do LinkedIn, Indeed, InfoJobs e outros sites. Cole os dados da vaga: o JobPilot <strong>não acessa</strong> a URL
        informada, ela só serve para identificar duplicatas e para você abrir o anúncio depois.
      </p>
      <ManualJobForm />
    </div>
  );
}
