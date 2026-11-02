/**
 * Coleta de vagas pela linha de comando.
 *
 *   npm run scan -- --source=gupy|remotive|all [--force]
 *
 * A busca vem do perfil do candidato mais recentemente atualizado (ou, sem perfil,
 * das sugestões de front-end júnior). Usa as variáveis do .env.
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { buildGupyKeywords, buildQueryFromProfile, DEFAULT_PROFILE_FOR_QUERY } from "@/server/jobs/query";
import { runScanForProfile, type ScanSummary } from "@/server/jobs/scan";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

function print(s: ScanSummary) {
  if (s.skipped) {
    console.log(`- ${s.sourceName}: não coletada. ${s.skipped}`);
    return;
  }
  console.log(
    `- ${s.sourceName}: ${s.status} | lidas ${s.fetched} | descartadas ${s.discardedIrrelevant} fora da área + ${s.discardedSeniority} nível acima | novas ${s.newCount} | atualizadas ${s.updatedCount} | duplicadas ${s.duplicateCount} | erros ${s.errorCount}`,
  );
  for (const e of s.errors) console.log(`    · ${e.message}`);
}

async function main() {
  const which = (arg("source") ?? "all").toLowerCase();
  const force = process.argv.includes("--force");

  const sources = await prisma.jobSource.findMany({ where: { enabled: true, kind: { not: "MANUAL" } }, orderBy: { slug: "asc" } });
  const selected = which === "all" ? sources : sources.filter((s) => s.slug === which);
  if (selected.length === 0) {
    console.error(`Nenhuma fonte habilitada corresponde a "${which}". Use --source=gupy|remotive|all.`);
    process.exitCode = 1;
    return;
  }

  const profile = await prisma.candidateProfile.findFirst({ orderBy: { updatedAt: "desc" } });
  const scanProfile = profile ?? DEFAULT_PROFILE_FOR_QUERY;
  console.log(`Palavras-chave (Remotive): ${buildQueryFromProfile(scanProfile).keywords.join(", ")}${profile ? "" : " (sugestões padrão: sem perfil)"}`);
  console.log(`Palavras-chave (Gupy): ${buildGupyKeywords(scanProfile).join(", ")}`);

  for (const source of selected) print(await runScanForProfile(source.slug, scanProfile, { force }));
}

main()
  .catch((err) => {
    console.error("Falha na coleta:", err instanceof Error ? err.message : "erro desconhecido");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
