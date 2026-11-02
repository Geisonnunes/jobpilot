"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { profileSchema, type ProfileFormState } from "@/lib/profile";

/**
 * Salva o perfil do usuário logado (upsert por userId).
 * O userId vem sempre da sessão, nunca do formulário.
 */
export async function saveProfile(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await requireUser();

  const text = (k: string) => String(formData.get(k) ?? "");
  const langs = formData.getAll("languageLang").map(String);
  const levels = formData.getAll("languageLevel").map(String);

  const parsed = profileSchema.safeParse({
    headline: text("headline"),
    city: text("city"),
    state: text("state"),
    country: text("country") || "BR",
    seniority: text("seniority"),
    targetRoles: formData.getAll("targetRoles").map(String),
    skills: formData.getAll("skills").map(String),
    workModes: formData.getAll("workModes").map(String),
    salaryMin: text("salaryMin"),
    minMatchScore: text("minMatchScore"),
    excludeKeywords: formData.getAll("excludeKeywords").map(String),
    linkedinUrl: text("linkedinUrl"),
    githubUrl: text("githubUrl"),
    portfolioUrl: text("portfolioUrl"),
    languages: langs.map((lang, i) => ({ lang, level: levels[i] ?? "" })),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Revise os campos destacados.",
      errors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  const data = { ...parsed.data, salaryCurrency: "BRL" };

  try {
    await prisma.candidateProfile.upsert({
      where: { userId: user.id },
      create: { ...data, userId: user.id },
      update: data,
    });
  } catch (error) {
    console.error("Falha ao salvar o perfil", error);
    return { status: "error", message: "Não foi possível salvar agora. Tente novamente." };
  }

  revalidatePath("/perfil");
  revalidatePath("/dashboard");
  return { status: "success", message: "Perfil salvo com sucesso." };
}
