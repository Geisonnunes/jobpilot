import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, SourceKind } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/** Fontes iniciais. Só APIs públicas ou entrada manual — nada de scraping. */
const sources = [
  {
    slug: "gupy",
    name: "Gupy",
    kind: SourceKind.PUBLIC_API,
    baseUrl: "https://portal.gupy.io",
    requestDelayMs: 1000,
  },
  {
    slug: "remotive",
    name: "Remotive",
    kind: SourceKind.PUBLIC_API,
    baseUrl: "https://remotive.com",
    // A API pública do Remotive pede poucas consultas por dia
    minIntervalMinutes: 720,
    requestDelayMs: 1000,
  },
  {
    slug: "manual",
    name: "Adicionada manualmente (LinkedIn, Indeed, InfoJobs…)",
    kind: SourceKind.MANUAL,
    minIntervalMinutes: 0,
    requestDelayMs: 0,
  },
];

async function main() {
  for (const source of sources) {
    await prisma.jobSource.upsert({
      where: { slug: source.slug },
      update: { name: source.name, kind: source.kind, baseUrl: source.baseUrl },
      create: source,
    });
  }
  console.log(`✔ ${sources.length} fontes de vagas cadastradas`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
