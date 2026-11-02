"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { UFS } from "@/lib/profile";
import { toPostingData, prepareJob } from "@/server/jobs/ingest";
import { DEFAULT_PROFILE_FOR_QUERY } from "@/server/jobs/query";
import { runScanForProfile, type ScanSummary } from "@/server/jobs/scan";
import { AiProviderError } from "@/server/ai/provider";
import { evaluatePostingForUser } from "@/server/ai/match/service";

export type ScanNowResult = { summaries: ScanSummary[]; message?: string };

/**
 * Roda a coleta das fontes habilitadas para o perfil do usuário logado.
 * (Fila e workers ficam para uma fase futura: aqui a coleta roda na própria requisição.)
 */
export async function scanNow(): Promise<ScanNowResult> {
  const user = await requireUser();
  const [profile, sources] = await Promise.all([
    prisma.candidateProfile.findUnique({ where: { userId: user.id } }),
    prisma.jobSource.findMany({ where: { enabled: true, kind: { not: "MANUAL" } }, orderBy: { slug: "asc" } }),
  ]);
  const scanProfile = profile ?? DEFAULT_PROFILE_FOR_QUERY;

  const summaries: ScanSummary[] = [];
  for (const source of sources) {
    try {
      summaries.push(await runScanForProfile(source.slug, scanProfile));
    } catch (error) {
      console.error(`Falha inesperada na coleta (${source.slug}):`, error instanceof Error ? error.name : "erro");
      summaries.push({
        source: source.slug,
        sourceName: source.name,
        skipped: "Erro inesperado ao coletar. Tente de novo mais tarde.",
        fetched: 0, newCount: 0, updatedCount: 0, duplicateCount: 0, errorCount: 0, errors: [], discardedIrrelevant: 0, discardedSeniority: 0,
      });
    }
  }

  revalidatePath("/vagas");
  return { summaries, message: sources.length === 0 ? "Nenhuma fonte habilitada." : undefined };
}

export type ManualJobState = {
  status: "idle" | "error" | "duplicate";
  message?: string;
  errors?: Record<string, string[] | undefined>;
  existingId?: string;
};

const manualSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, "Informe a URL da vaga.")
    .max(2048, "A URL é longa demais.")
    .refine((v) => {
      try {
        const u = new URL(v);
        return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".");
      } catch {
        return false;
      }
    }, "Informe uma URL válida, começando com https://"),
  title: z.string().trim().min(3, "Informe o título da vaga.").max(200, "Use até 200 caracteres."),
  company: z.string().trim().min(2, "Informe a empresa.").max(150, "Use até 150 caracteres."),
  description: z
    .string()
    .trim()
    .min(50, "Cole a descrição da vaga (pelo menos 50 caracteres).")
    .max(20_000, "A descrição pode ter no máximo 20.000 caracteres."),
  city: z.string().trim().max(80, "Use até 80 caracteres.").optional(),
  state: z
    .string()
    .trim()
    .refine((v) => v === "" || (UFS as readonly string[]).includes(v), "Selecione uma UF válida.")
    .optional(),
  workMode: z
    .string()
    .trim()
    .refine((v) => v === "" || ["REMOTE", "HYBRID", "ONSITE"].includes(v), "Selecione uma modalidade válida."),
});

/**
 * Cadastra uma vaga colada pelo usuário (LinkedIn, Indeed, InfoJobs…).
 * NENHUMA requisição é feita à URL informada: ela só é normalizada para detectar duplicatas.
 */
export async function createManualJob(_prev: ManualJobState, formData: FormData): Promise<ManualJobState> {
  const user = await requireUser();
  const text = (k: string) => String(formData.get(k) ?? "");

  const parsed = manualSchema.safeParse({
    url: text("url"), title: text("title"), company: text("company"), description: text("description"),
    city: text("city"), state: text("state"), workMode: text("workMode"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Revise os campos destacados.", errors: z.flattenError(parsed.error).fieldErrors };
  }
  const d = parsed.data;

  const source = await prisma.jobSource.findUnique({ where: { slug: "manual" } });
  if (!source) return { status: "error", message: "A fonte \"manual\" não está cadastrada. Rode `npm run db:seed`." };

  const location = [d.city, d.state].filter(Boolean).join(", ") || undefined;
  const prepared = prepareJob({
    url: d.url,
    title: d.title,
    company: d.company,
    description: d.description,
    location,
    city: d.city || undefined,
    state: d.state || undefined,
    country: "BR",
    workMode: d.workMode ? (d.workMode as "REMOTE" | "HYBRID" | "ONSITE") : undefined,
  });
  if (!prepared) return { status: "error", message: "Não foi possível ler esta vaga.", errors: { url: ["Informe uma URL válida, começando com https://"] } };

  const sameUrl = await prisma.jobPosting.findUnique({ where: { canonicalUrl: prepared.canonicalUrl }, select: { id: true, title: true } });
  if (sameUrl) {
    return { status: "duplicate", message: `Essa vaga já está cadastrada (mesma URL, ignorando parâmetros de rastreamento): “${sameUrl.title}”.`, existingId: sameUrl.id };
  }
  const sameContent = await prisma.jobPosting.findFirst({ where: { contentHash: prepared.contentHash }, select: { id: true, title: true } });
  if (sameContent) {
    return { status: "duplicate", message: `Já existe uma vaga com o mesmo conteúdo em outra URL: “${sameContent.title}”.`, existingId: sameContent.id };
  }

  const created = await prisma.jobPosting.create({
    data: { ...toPostingData(prepared), sourceId: source.id, externalId: null, addedByUserId: user.id, status: "OPEN" },
    select: { id: true },
  });
  revalidatePath("/vagas");
  redirect(`/vagas/${created.id}`);
}

export type EvaluateJobState = { ok: boolean; message?: string };

const postingIdSchema = z.string().regex(/^[a-z0-9]{10,40}$/i);

/**
 * Avalia UMA vaga com IA para o usuário logado (o lote fica no script `npm run match`).
 * O dono do currículo/perfil vem da sessão; a vaga só é aceita se for visível ao usuário.
 */
export async function evaluateJob(postingId: string, force: boolean): Promise<EvaluateJobState> {
  const user = await requireUser();
  const id = postingIdSchema.safeParse(postingId);
  if (!id.success) return { ok: false, message: "Vaga inválida." };

  try {
    const out = await evaluatePostingForUser(user.id, id.data, { force: force === true });
    revalidatePath(`/vagas/${id.data}`);
    revalidatePath("/vagas");
    revalidatePath("/dashboard");
    switch (out.status) {
      case "evaluated":
      case "cached":
        return { ok: true };
      case "prefiltered":
        return { ok: false, message: out.reason };
      case "invalid":
        return { ok: false, message: "A IA devolveu uma resposta fora do formato duas vezes. Tente de novo mais tarde." };
      case "unavailable":
        return {
          ok: false,
          message:
            out.reason === "no-profile" ? "Preencha o perfil antes de avaliar." : out.reason === "no-resume" ? "Cadastre um currículo principal antes de avaliar." : "Vaga não encontrada.",
        };
    }
  } catch (error) {
    // Só o nome/mensagem genérica do erro: nunca prompt ou CV.
    console.error("Falha na avaliação de IA:", error instanceof Error ? error.name : "erro");
    if (error instanceof AiProviderError) return { ok: false, message: error.message };
    return { ok: false, message: "Não foi possível avaliar agora. Tente novamente." };
  }
}
