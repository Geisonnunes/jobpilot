import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getAiProvider } from "../index";
import { prismaUsageStore } from "../usage-store";
import { evaluateMatch, type EvaluateInput, type EvaluateOutcome, type MatchStore } from "./evaluate";
import { PROMPT_VERSION } from "./prompts/match-v1";
import type { Prisma } from "@/generated/prisma/client";
import type { WorkMode } from "@/generated/prisma/enums";

/** Ligação com o banco: carrega perfil + CV principal + vaga e chama evaluateMatch. */

export const prismaMatchStore: MatchStore = {
  async find(key) {
    return prisma.jobMatch.findUnique({
      where: { userId_postingId_resumeId_promptVersion: key },
      select: { id: true },
    });
  },
  async save(data) {
    const { userId, postingId, resumeId, promptVersion, dimensions, ...rest } = data;
    const common = { ...rest, dimensions: dimensions as Prisma.InputJsonValue, score: rest.score.toFixed(1) };
    return prisma.jobMatch.upsert({
      where: { userId_postingId_resumeId_promptVersion: { userId, postingId, resumeId, promptVersion } },
      create: { userId, postingId, resumeId, promptVersion, ...common },
      update: { ...common, createdAt: new Date() },
      select: { id: true },
    });
  },
};

export type PrepareResult =
  | { ok: true; input: EvaluateInput }
  | { ok: false; reason: "no-profile" | "no-resume" | "no-posting" };

/** Mesma regra de visibilidade de /vagas: coletadas (de todos) ou manuais do próprio usuário. */
export async function loadEvaluateInput(userId: string, postingId: string): Promise<PrepareResult> {
  const [user, profile, resume, posting] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    prisma.candidateProfile.findUnique({ where: { userId } }),
    prisma.resume.findFirst({ where: { userId, isPrimary: true }, select: { id: true, rawText: true } }),
    prisma.jobPosting.findFirst({ where: { id: postingId, OR: [{ addedByUserId: null }, { addedByUserId: userId }] } }),
  ]);
  if (!profile) return { ok: false, reason: "no-profile" };
  if (!resume) return { ok: false, reason: "no-resume" };
  if (!posting) return { ok: false, reason: "no-posting" };

  const names = [user?.name ?? "", (user?.name ?? "").split(/\s+/)[0] ?? ""].filter((n) => n.length >= 3);
  const languages = Array.isArray(profile.languages)
    ? (profile.languages as Array<{ lang?: unknown; level?: unknown }>)
        .filter((l) => typeof l?.lang === "string" && typeof l?.level === "string")
        .map((l) => ({ lang: String(l.lang), level: String(l.level) }))
    : [];

  return {
    ok: true,
    input: {
      userId,
      userNames: names,
      profile: {
        headline: profile.headline,
        targetRoles: profile.targetRoles,
        skills: profile.skills,
        seniority: profile.seniority,
        workModes: profile.workModes as WorkMode[],
        city: profile.city,
        state: profile.state,
        country: profile.country,
        salaryMin: profile.salaryMin,
        salaryCurrency: profile.salaryCurrency,
        languages,
        excludeKeywords: profile.excludeKeywords,
        minMatchScore: Number(profile.minMatchScore),
      },
      resume: { id: resume.id, rawText: resume.rawText },
      posting: {
        id: posting.id,
        status: posting.status,
        title: posting.title,
        company: posting.company,
        location: posting.location,
        workMode: posting.workMode,
        state: posting.state,
        seniority: posting.seniority,
        employmentType: posting.employmentType,
        salaryMin: posting.salaryMin,
        salaryMax: posting.salaryMax,
        salaryCurrency: posting.salaryCurrency,
        description: posting.description,
      },
    },
  };
}

/** Fila de uma só: o claude-cli roda uma avaliação por vez (também entre requisições do servidor). */
const globalForLock = globalThis as unknown as { __aiMatchChain?: Promise<unknown> };

export function withAiLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = globalForLock.__aiMatchChain ?? Promise.resolve();
  const run = previous.then(task, task);
  globalForLock.__aiMatchChain = run.catch(() => undefined);
  return run;
}

export type EvaluateForUserResult = EvaluateOutcome | { status: "unavailable"; reason: "no-profile" | "no-resume" | "no-posting" };

export async function evaluatePostingForUser(userId: string, postingId: string, options: { force?: boolean } = {}): Promise<EvaluateForUserResult> {
  const prepared = await loadEvaluateInput(userId, postingId);
  if (!prepared.ok) return { status: "unavailable", reason: prepared.reason };

  const provider = getAiProvider();
  return withAiLock(() =>
    evaluateMatch(
      prepared.input,
      { provider, usage: prismaUsageStore, matches: prismaMatchStore, model: env.AI_MODEL_MATCH, monthlyBudgetUsd: env.AI_MONTHLY_BUDGET_USD },
      options,
    ),
  );
}

export { PROMPT_VERSION };
