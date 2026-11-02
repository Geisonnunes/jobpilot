/**
 * Limpeza das vagas da Gupy já salvas, com o filtro de relevância atual.
 *
 *   npm run jobs:cleanup                # padrão: --dry-run (só lista, nada é apagado)
 *   npm run jobs:cleanup -- --apply     # apaga de verdade
 *
 * Nunca remove vagas manuais, vagas com avaliação de IA (JobMatch) ou com candidatura (Application).
 * Usa a senioridade do perfil atualizado mais recentemente (sem perfil: júnior).
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { classifyRelevance, type RelevanceCategory } from "@/server/jobs/relevance";

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply && process.argv.includes("--dry-run")) {
    console.error("Use --apply OU --dry-run, não os dois.");
    process.exitCode = 1;
    return;
  }

  const profile = await prisma.candidateProfile.findFirst({ orderBy: { updatedAt: "desc" }, select: { seniority: true } });
  const seniority = profile?.seniority ?? "JUNIOR";

  const where = {
    source: { slug: "gupy" },
    addedByUserId: null,
    matches: { none: {} },
    applications: { none: {} },
  };
  const gupy = { source: { slug: "gupy" } };
  const [total, withMatch, withApplication, manual, candidates] = await Promise.all([
    prisma.jobPosting.count({ where: gupy }),
    prisma.jobPosting.count({ where: { ...gupy, matches: { some: {} } } }),
    prisma.jobPosting.count({ where: { ...gupy, applications: { some: {} } } }),
    prisma.jobPosting.count({ where: { ...gupy, addedByUserId: { not: null } } }),
    prisma.jobPosting.findMany({ where, select: { id: true, title: true, description: true }, orderBy: { firstSeenAt: "desc" } }),
  ]);
  const protectedCount = total - candidates.length; // união: uma vaga pode ter mais de um motivo

  const toRemove: Array<{ id: string; title: string; category: RelevanceCategory; reason: string }> = [];
  for (const job of candidates) {
    const r = classifyRelevance({ title: job.title, description: job.description }, { seniority });
    if (!r.keep) toRemove.push({ id: job.id, title: job.title, category: r.category, reason: r.reason });
  }

  const byCategory = (c: RelevanceCategory) => toRemove.filter((j) => j.category === c).length;
  console.log(`Modo: ${apply ? "APPLY (apaga de verdade)" : "DRY-RUN (nada é apagado)"} | senioridade do perfil: ${seniority}`);
  console.log(`Total de vagas da Gupy no banco: ${total}`);
  console.log(`  Protegidas (nunca removidas): ${protectedCount}`);
  console.log(`    com avaliação de IA: ${withMatch} | com candidatura: ${withApplication} | adicionadas manualmente: ${manual} (os motivos podem se sobrepor)`);
  console.log(`  Sem proteção, analisadas pelo filtro: ${candidates.length}`);
  console.log(`    seriam removidas: ${toRemove.length} (${byCategory("IRRELEVANT")} fora da área, ${byCategory("SENIORITY_ABOVE")} de nível acima)`);
  console.log(`    ficariam: ${candidates.length - toRemove.length}`);
  console.log(`Conferência: ${protectedCount} protegidas + ${toRemove.length} removidas + ${candidates.length - toRemove.length} mantidas = ${total}
`);
  for (const j of toRemove) console.log(`- [${j.category === "IRRELEVANT" ? "área " : "nível"}] ${j.title.slice(0, 110)} — ${j.reason}`);

  if (!apply) {
    console.log("\nDry-run: nada foi alterado. Para remover, rode com --apply.");
    return;
  }
  // Rechecagem no próprio DELETE: nunca apaga o que ganhou avaliação/candidatura entre a listagem e agora.
  const result = await prisma.jobPosting.deleteMany({
    where: { id: { in: toRemove.map((j) => j.id) }, addedByUserId: null, matches: { none: {} }, applications: { none: {} } },
  });
  console.log(`\nRemovidas: ${result.count}.`);
}

main()
  .catch((err) => {
    console.error("Falha na limpeza:", err instanceof Error ? err.name : "erro");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
