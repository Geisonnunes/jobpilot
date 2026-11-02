import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { NormalizedJob } from "@/server/connectors/types";
import { prepareJob, toPostingData, type PreparedJob } from "./prepare";

export { prepareJob, toPostingData, type PreparedJob };

export interface ScanError {
  message: string;
  url?: string;
  at: string;
}

export interface IngestCounts {
  fetched: number;
  newCount: number;
  updatedCount: number;
  duplicateCount: number;
  errorCount: number;
  errors: ScanError[];
}

type ExistingPosting = Prisma.JobPostingGetPayload<{ select: typeof existingSelect }>;
const existingSelect = {
  id: true,
  canonicalUrl: true,
  externalId: true,
  title: true,
  company: true,
  description: true,
  location: true,
  city: true,
  state: true,
  workMode: true,
  seniority: true,
  employmentType: true,
  tags: true,
  publishedAt: true,
} satisfies Prisma.JobPostingSelect;

function hasChanged(old: ExistingPosting, next: PreparedJob): boolean {
  return (
    old.title !== next.title ||
    old.company !== next.company ||
    old.description !== next.description ||
    old.location !== next.location ||
    old.city !== next.city ||
    old.state !== next.state ||
    old.workMode !== next.workMode ||
    old.seniority !== next.seniority ||
    old.employmentType !== next.employmentType ||
    old.tags.join("\u0000") !== next.tags.join("\u0000") ||
    (old.publishedAt?.getTime() ?? null) !== (next.publishedAt?.getTime() ?? null)
  );
}

const summarize = (err: unknown) =>
  // Nunca inclui a descrição: só o tipo do erro do Prisma ou a mensagem curta.
  err instanceof Prisma.PrismaClientKnownRequestError ? `Erro do banco (${err.code})` : err instanceof Error ? err.message.slice(0, 200) : "Erro desconhecido";

/**
 * Salva vagas de uma fonte. Deduplica por (sourceId, externalId) e por canonicalUrl.
 *
 * - Vaga existente: atualiza lastSeenAt e, se algum campo mudou, os campos (conta em "atualizadas").
 * - Vaga nova: cria. Se o contentHash já existir em OUTRA URL (mesma vaga republicada, ou em outra
 *   cidade), a vaga é salva mesmo assim, mas conta como "duplicada" e não como "nova".
 */
export async function saveJobs(sourceId: string, jobs: NormalizedJob[], now: Date = new Date()): Promise<IngestCounts> {
  const counts: IngestCounts = { fetched: jobs.length, newCount: 0, updatedCount: 0, duplicateCount: 0, errorCount: 0, errors: [] };
  const fail = (message: string, url?: string) => {
    counts.errorCount++;
    if (counts.errors.length < 20) counts.errors.push({ message, url, at: now.toISOString() });
  };

  const prepared: PreparedJob[] = [];
  for (const job of jobs) {
    const p = prepareJob(job);
    if (p) prepared.push(p);
    else fail("Vaga ignorada: URL, título ou empresa inválidos.", job.url?.slice(0, 200));
  }
  if (prepared.length === 0) return counts;

  const urls = prepared.map((p) => p.canonicalUrl);
  const externalIds = prepared.map((p) => p.externalId).filter((v): v is string => Boolean(v));
  const [byUrlRows, byExtRows, hashRows] = await Promise.all([
    prisma.jobPosting.findMany({ where: { canonicalUrl: { in: urls } }, select: existingSelect }),
    externalIds.length
      ? prisma.jobPosting.findMany({ where: { sourceId, externalId: { in: externalIds } }, select: existingSelect })
      : Promise.resolve([] as ExistingPosting[]),
    prisma.jobPosting.findMany({ where: { contentHash: { in: prepared.map((p) => p.contentHash) } }, select: { contentHash: true } }),
  ]);
  const byUrl = new Map(byUrlRows.map((r) => [r.canonicalUrl, r]));
  const byExt = new Map(byExtRows.map((r) => [r.externalId as string, r]));
  const knownHashes = new Set(hashRows.map((r) => r.contentHash));

  for (const p of prepared) {
    try {
      const existing = (p.externalId ? byExt.get(p.externalId) : undefined) ?? byUrl.get(p.canonicalUrl);
      const data = toPostingData(p);

      if (existing) {
        const changed = hasChanged(existing, p);
        await prisma.jobPosting.update({
          where: { id: existing.id },
          data: changed ? { ...data, lastSeenAt: now, status: "OPEN" } : { lastSeenAt: now, status: "OPEN" },
        });
        if (changed) counts.updatedCount++;
        continue;
      }

      const created = await prisma.jobPosting.create({
        data: { ...data, sourceId, externalId: p.externalId, firstSeenAt: now, lastSeenAt: now },
        select: existingSelect,
      });
      byUrl.set(created.canonicalUrl, created);
      if (created.externalId) byExt.set(created.externalId, created);
      if (knownHashes.has(p.contentHash)) counts.duplicateCount++;
      else counts.newCount++;
      knownHashes.add(p.contentHash);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        counts.duplicateCount++; // corrida: outra coleta criou a mesma vaga agora há pouco
      } else {
        fail(summarize(err), p.canonicalUrl);
      }
    }
  }
  return counts;
}
