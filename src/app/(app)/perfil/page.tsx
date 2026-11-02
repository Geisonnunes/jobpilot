import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { centsToReais, SUGGESTED_VALUES, type LanguageEntry, type ProfileFormValues } from "@/lib/profile";
import { ProfileForm } from "./profile-form";

/**
 * Página síncrona: sessão e banco são lidos em PerfilContent, dentro do
 * <Suspense> da própria página (o do layout não cobre navegações do cliente).
 */
export default function PerfilPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Carregando…</p>}>
      <PerfilContent />
    </Suspense>
  );
}

function parseLanguages(json: unknown): LanguageEntry[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { lang, level } = item as Record<string, unknown>;
    if (typeof lang !== "string") return [];
    const valid = ["basic", "intermediate", "advanced", "fluent"].includes(String(level));
    return [{ lang, level: (valid ? level : "basic") as LanguageEntry["level"] }];
  });
}

async function PerfilContent() {
  const user = await requireUser();
  const profile = await prisma.candidateProfile.findUnique({ where: { userId: user.id } });

  const initial: ProfileFormValues = profile
    ? {
        headline: profile.headline ?? "",
        city: profile.city ?? "",
        state: profile.state ?? "",
        country: profile.country,
        seniority: profile.seniority,
        targetRoles: profile.targetRoles,
        skills: profile.skills,
        workModes: profile.workModes,
        salaryMin: centsToReais(profile.salaryMin),
        minMatchScore: Number(profile.minMatchScore).toFixed(1),
        excludeKeywords: profile.excludeKeywords,
        linkedinUrl: profile.linkedinUrl ?? "",
        githubUrl: profile.githubUrl ?? "",
        portfolioUrl: profile.portfolioUrl ?? "",
        languages: parseLanguages(profile.languages),
      }
    : SUGGESTED_VALUES;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Seu perfil</h1>
      <p className="mt-1 text-zinc-600 dark:text-zinc-400">
        O JobPilot usa essas informações para buscar e avaliar vagas para você.
      </p>
      <ProfileForm initial={initial} isNew={!profile} />
    </div>
  );
}
