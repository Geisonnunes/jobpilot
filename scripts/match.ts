/**
 * Avaliação de compatibilidade em lote, pela linha de comando.
 *
 *   npm run match [-- --limit=N] [-- --posting=<id>] [-- --force]
 *
 * Avalia, da mais recente para a mais antiga, as vagas que passaram no pré-filtro e ainda não
 * têm avaliação (CV principal + versão atual do prompt). Uma por vez. Usa o perfil e o CV
 * principal do usuário com o perfil atualizado mais recentemente.
 * Nada do CV ou do perfil é impresso.
 */
import "dotenv/config";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { prefilterPosting } from "@/server/ai/prefilter";
import { AiProviderError } from "@/server/ai/provider";
import { PROMPT_VERSION } from "@/server/ai/match/prompts/match-v1";
import { evaluatePostingForUser } from "@/server/ai/match/service";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const force = process.argv.includes("--force");
  const limitArg = arg("limit");
  const limit = limitArg ? Number.parseInt(limitArg, 10) : env.AI_MAX_EVALUATIONS_PER_RUN;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    console.error("--limit deve ser um número entre 1 e 200.");
    process.exitCode = 1;
    return;
  }

  const profile = await prisma.candidateProfile.findFirst({ orderBy: { updatedAt: "desc" } });
  if (!profile) {
    console.error("Nenhum perfil encontrado. Preencha o perfil em /perfil primeiro.");
    process.exitCode = 1;
    return;
  }
  const userId = profile.userId;
  const resume = await prisma.resume.findFirst({ where: { userId, isPrimary: true }, select: { id: true } });
  if (!resume) {
    console.error("Nenhum currículo principal. Cadastre um em /curriculo primeiro.");
    process.exitCode = 1;
    return;
  }

  console.log(`Provedor: ${env.AI_PROVIDER} | prompt: ${PROMPT_VERSION} | limite: ${limit}`);

  let ids: string[];
  const postingId = arg("posting");
  if (postingId) {
    ids = [postingId];
  } else {
    const done = new Set(
      (await prisma.jobMatch.findMany({ where: { userId, resumeId: resume.id, promptVersion: PROMPT_VERSION }, select: { postingId: true } })).map((m) => m.postingId),
    );
    const recent = await prisma.jobPosting.findMany({
      where: { status: { not: "CLOSED" }, OR: [{ addedByUserId: null }, { addedByUserId: userId }] },
      orderBy: [{ firstSeenAt: "desc" }],
      take: 500,
      select: { id: true, status: true, title: true, description: true, seniority: true, workMode: true },
    });
    ids = recent
      .filter((p) => !done.has(p.id) && prefilterPosting(p, profile).pass)
      .slice(0, limit)
      .map((p) => p.id);
  }

  if (ids.length === 0) {
    console.log("Nada para avaliar: nenhuma vaga nova que passe no pré-filtro.");
    return;
  }

  let evaluated = 0;
  let cached = 0;
  let skipped = 0;
  let failed = 0;
  const times: number[] = [];

  for (const id of ids) {
    const started = Date.now();
    try {
      const out = await evaluatePostingForUser(userId, id, { force });
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      switch (out.status) {
        case "evaluated":
          evaluated += 1;
          times.push(Date.now() - started);
          console.log(`- ${id}: nota ${out.score.toFixed(1)} ${out.recommendation} (${secs}s${out.attempts > 1 ? ", 2ª tentativa" : ""}${out.evidenceRemoved ? `, ${out.evidenceRemoved} evidência(s) removida(s)` : ""}${out.suspect ? ", SUSPEITA" : ""})`);
          break;
        case "cached":
          cached += 1;
          console.log(`- ${id}: já avaliada (use --force para reavaliar)`);
          break;
        case "prefiltered":
          skipped += 1;
          console.log(`- ${id}: descartada no pré-filtro. ${out.reason}`);
          break;
        case "invalid":
          failed += 1;
          console.log(`- ${id}: resposta inválida da IA duas vezes (${out.problem})`);
          break;
        case "unavailable":
          failed += 1;
          console.log(`- ${id}: indisponível (${out.reason})`);
          break;
      }
    } catch (error) {
      failed += 1;
      const message = error instanceof AiProviderError ? error.message : "falha inesperada";
      console.log(`- ${id}: erro. ${message}`);
      if (error instanceof AiProviderError && error.code === "budget") break;
    }
  }

  const avg = times.length ? `${(times.reduce((a, b) => a + b, 0) / times.length / 1000).toFixed(1)}s` : "-";
  console.log(`\nResumo: ${evaluated} avaliada(s), ${cached} em cache, ${skipped} descartada(s), ${failed} com erro. Tempo médio: ${avg}.`);
}

main()
  .catch((err) => {
    console.error("Falha no match:", err instanceof Error ? err.name : "erro");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
