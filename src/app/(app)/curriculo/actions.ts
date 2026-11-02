"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { extractText } from "unpdf";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  PDF_MAX_BYTES,
  cleanResumeText,
  normalizeForHash,
  resumeIdSchema,
  saveResumeSchema,
  type PdfExtractResult,
  type ResumeActionResult,
  type ResumeFormState,
} from "@/lib/resume";

// PRIVACIDADE: nenhum texto de currículo é registrado em logs nem em mensagens de erro.

function revalidateAll() {
  revalidatePath("/curriculo");
  revalidatePath("/dashboard");
}

/**
 * Extrai o texto de um PDF enviado. Não salva nada: o arquivo vive só em memória
 * e o texto volta ao formulário para o usuário revisar antes de salvar.
 */
export async function extractPdfText(formData: FormData): Promise<PdfExtractResult> {
  await requireUser();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Selecione um arquivo PDF." };
  }
  if (file.size > PDF_MAX_BYTES) {
    return { ok: false, message: "O PDF excede o limite de 5 MB." };
  }
  if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
    return { ok: false, message: "Envie um arquivo PDF (application/pdf)." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Assinatura do arquivo: "%PDF" (a extensão e o tipo informados pelo navegador não bastam).
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  if (!isPdf) {
    return { ok: false, message: "Esse arquivo não é um PDF válido, mesmo com a extensão .pdf." };
  }

  try {
    const { text, totalPages } = await extractText(bytes, { mergePages: true });
    const cleaned = cleanResumeText(text);
    if (cleaned.replace(/\s/g, "").length < 20) {
      return {
        ok: false,
        message:
          "Não encontramos texto nesse PDF (ele pode ser escaneado ou só ter imagens). Cole o texto do currículo manualmente.",
      };
    }
    return { ok: true, text: cleaned, pages: totalPages };
  } catch (error) {
    // Só o tipo do erro: a mensagem poderia conter trechos do documento.
    console.error("Falha ao extrair texto do PDF:", error instanceof Error ? error.name : "erro desconhecido");
    return { ok: false, message: "Não foi possível ler esse PDF (ele pode estar protegido ou corrompido). Cole o texto manualmente." };
  }
}

/**
 * Cria um currículo. Se já existir um com o mesmo nome (sem diferenciar maiúsculas),
 * cria uma nova versão (version + 1). Texto idêntico a uma versão existente é recusado.
 */
export async function saveResume(_prev: ResumeFormState, formData: FormData): Promise<ResumeFormState> {
  const user = await requireUser();

  const parsed = saveResumeSchema.safeParse({
    label: String(formData.get("label") ?? ""),
    rawText: String(formData.get("rawText") ?? ""),
  });
  if (!parsed.success) {
    return { status: "error", message: "Revise os campos destacados.", errors: z.flattenError(parsed.error).fieldErrors };
  }
  const { rawText } = parsed.data;
  const contentHash = createHash("sha256").update(normalizeForHash(rawText)).digest("hex");

  const duplicate = await prisma.resume.findFirst({
    where: { userId: user.id, contentHash },
    select: { label: true, version: true },
  });
  if (duplicate) {
    return {
      status: "duplicate",
      message: `Esse texto é idêntico ao de “${duplicate.label}” (versão ${duplicate.version}). Nada foi salvo.`,
    };
  }

  try {
    const saved = await prisma.$transaction(async (tx) => {
      const sameLabel = await tx.resume.findFirst({
        where: { userId: user.id, label: { equals: parsed.data.label, mode: "insensitive" } },
        orderBy: { version: "desc" },
        select: { label: true, version: true },
      });
      const label = sameLabel?.label ?? parsed.data.label;
      const version = (sameLabel?.version ?? 0) + 1;
      const hasPrimary = (await tx.resume.count({ where: { userId: user.id, isPrimary: true } })) > 0;

      await tx.resume.create({
        data: { userId: user.id, label, version, rawText, contentHash, isPrimary: !hasPrimary, fileUrl: null },
      });
      return { label, version, primary: !hasPrimary };
    });

    revalidateAll();
    return {
      status: "success",
      message: `Currículo “${saved.label}” salvo como versão ${saved.version}${saved.primary ? " e definido como principal" : ""}.`,
    };
  } catch (error) {
    console.error("Falha ao salvar o currículo:", error instanceof Error ? error.name : "erro desconhecido");
    return { status: "error", message: "Não foi possível salvar agora. Tente novamente." };
  }
}

/** Marca uma versão como principal (só uma por usuário), numa transação. */
export async function setPrimaryResume(resumeId: string): Promise<ResumeActionResult> {
  const user = await requireUser();
  const id = resumeIdSchema.safeParse(resumeId);
  if (!id.success) return { ok: false, message: "Currículo inválido." };

  const ok = await prisma.$transaction(async (tx) => {
    const target = await tx.resume.findFirst({ where: { id: id.data, userId: user.id }, select: { id: true } });
    if (!target) return false;
    await tx.resume.updateMany({ where: { userId: user.id, isPrimary: true, NOT: { id: target.id } }, data: { isPrimary: false } });
    await tx.resume.update({ where: { id: target.id }, data: { isPrimary: true } });
    return true;
  });

  if (!ok) return { ok: false, message: "Currículo não encontrado." };
  revalidateAll();
  return { ok: true };
}

/**
 * Exclui uma versão (JobMatch e GeneratedDocument dependentes caem em cascata).
 * Se era a principal, promove a versão mais recente que sobrar.
 */
export async function deleteResume(resumeId: string): Promise<ResumeActionResult> {
  const user = await requireUser();
  const id = resumeIdSchema.safeParse(resumeId);
  if (!id.success) return { ok: false, message: "Currículo inválido." };

  const ok = await prisma.$transaction(async (tx) => {
    const target = await tx.resume.findFirst({ where: { id: id.data, userId: user.id }, select: { id: true, isPrimary: true } });
    if (!target) return false;
    await tx.resume.delete({ where: { id: target.id } });
    if (target.isPrimary) {
      const next = await tx.resume.findFirst({
        where: { userId: user.id },
        orderBy: [{ createdAt: "desc" }, { version: "desc" }],
        select: { id: true },
      });
      if (next) await tx.resume.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
    return true;
  });

  if (!ok) return { ok: false, message: "Currículo não encontrado." };
  revalidateAll();
  return { ok: true };
}
