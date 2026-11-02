import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@/generated/prisma/client";
import type { ScanStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { createConnectorContext } from "@/server/connectors/http";
import { getConnector } from "@/server/connectors/registry";
import type { ConnectorQuery, NormalizedJob } from "@/server/connectors/types";
import { saveJobs, type ScanError } from "./ingest";
import { MAX_JOBS_PER_RUN } from "./query";

/** Uma coleta RUNNING há mais tempo que isso é considerada travada e não bloqueia a próxima. */
const STALE_RUNNING_MS = 10 * 60_000;

export interface ScanSummary {
  source: string;
  sourceName: string;
  /** Preenchido quando a coleta NÃO foi feita (intervalo mínimo, fonte desabilitada, já em andamento…). */
  skipped?: string;
  status?: ScanStatus;
  scanRunId?: string;
  fetched: number;
  newCount: number;
  updatedCount: number;
  duplicateCount: number;
  errorCount: number;
  errors: ScanError[];
}

export interface RunScanOptions {
  query: ConnectorQuery;
  /** Ignora minIntervalMinutes. */
  force?: boolean;
  now?: Date;
}

const empty = (source: string, sourceName: string): ScanSummary => ({
  source,
  sourceName,
  fetched: 0,
  newCount: 0,
  updatedCount: 0,
  duplicateCount: 0,
  errorCount: 0,
  errors: [],
});

function formatMinutes(min: number): string {
  if (min < 60) return `${Math.max(1, Math.ceil(min))} min`;
  const h = Math.floor(min / 60);
  const m = Math.ceil(min % 60);
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

/**
 * Só para desenvolvimento: com JOBPILOT_RECORD_DIR definido, grava as respostas cruas
 * das fontes nessa pasta (usado para criar as fixtures dos testes com UMA coleta real).
 */
function recorder(slug: string) {
  const dir = process.env.JOBPILOT_RECORD_DIR;
  if (!dir || process.env.NODE_ENV === "production") return undefined;
  let n = 0;
  return async (_url: string, res: Response) => {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${slug}-${n++}.json`), await res.text());
  };
}

/**
 * Executa a coleta de uma fonte: cria o ScanRun, chama o conector, salva as vagas
 * e fecha o ScanRun com SUCCESS, PARTIAL ou FAILED.
 */
export async function runScan(sourceSlug: string, options: RunScanOptions): Promise<ScanSummary> {
  const now = options.now ?? new Date();
  const source = await prisma.jobSource.findUnique({ where: { slug: sourceSlug } });
  if (!source) throw new Error(`Fonte desconhecida: ${sourceSlug}`);
  const summary = empty(source.slug, source.name);

  const connector = getConnector(source.slug);
  if (!connector) return { ...summary, skipped: "Esta fonte não tem coleta automática (vagas são adicionadas manualmente)." };
  if (!source.enabled) return { ...summary, skipped: "Fonte desabilitada." };

  // Já tem uma coleta em andamento? Evita duplo clique e coletas concorrentes.
  const running = await prisma.scanRun.findFirst({
    where: { sourceId: source.id, status: "RUNNING", startedAt: { gt: new Date(now.getTime() - STALE_RUNNING_MS) } },
    select: { id: true },
  });
  if (running) return { ...summary, skipped: "Já existe uma coleta desta fonte em andamento." };

  // Intervalo mínimo desde a última coleta bem-sucedida.
  if (!options.force && source.minIntervalMinutes > 0) {
    const last = await prisma.scanRun.findFirst({
      where: { sourceId: source.id, status: { in: ["SUCCESS", "PARTIAL"] }, finishedAt: { not: null } },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    });
    if (last?.finishedAt) {
      const elapsedMin = (now.getTime() - last.finishedAt.getTime()) / 60_000;
      if (elapsedMin < source.minIntervalMinutes) {
        const wait = formatMinutes(source.minIntervalMinutes - elapsedMin);
        return {
          ...summary,
          skipped: `Coleta recente: o intervalo mínimo desta fonte é de ${formatMinutes(source.minIntervalMinutes)}. Tente de novo em ${wait}.`,
        };
      }
    }
  }

  const query: ConnectorQuery = { ...options.query, maxResults: Math.min(options.query.maxResults ?? MAX_JOBS_PER_RUN, MAX_JOBS_PER_RUN) };
  const run = await prisma.scanRun.create({
    data: {
      sourceId: source.id,
      status: "RUNNING",
      startedAt: now,
      query: query as unknown as Prisma.InputJsonValue,
    },
  });

  const warnings: ScanError[] = [];
  const ctx = createConnectorContext({
    allowedHosts: connector.allowedHosts,
    requestDelayMs: source.requestDelayMs,
    onResponse: recorder(source.slug),
    log: (message, meta) => {
      if (meta?.level === "warn" && warnings.length < 20) warnings.push({ message: message.slice(0, 300), at: new Date().toISOString() });
    },
  });

  let jobs: NormalizedJob[] = [];
  let fatal: ScanError | null = null;
  try {
    jobs = (await connector.search(query, ctx)).slice(0, MAX_JOBS_PER_RUN);
  } catch (err) {
    fatal = { message: (err instanceof Error ? err.message : "Erro desconhecido").slice(0, 300), at: new Date().toISOString() };
  }

  const saved = fatal
    ? { fetched: 0, newCount: 0, updatedCount: 0, duplicateCount: 0, errorCount: 0, errors: [] as ScanError[] }
    : await saveJobs(source.id, jobs, now);

  const errors = [...(fatal ? [fatal] : []), ...warnings, ...saved.errors].slice(0, 20);
  const errorCount = saved.errorCount + warnings.length + (fatal ? 1 : 0);
  const status: ScanStatus = fatal ? "FAILED" : errorCount > 0 ? "PARTIAL" : "SUCCESS";

  await prisma.scanRun.update({
    where: { id: run.id },
    data: {
      status,
      finishedAt: new Date(),
      fetchedCount: saved.fetched,
      newCount: saved.newCount,
      updatedCount: saved.updatedCount,
      duplicateCount: saved.duplicateCount,
      errorCount,
      errors: errors.length > 0 ? (errors as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    },
  });

  return {
    ...summary,
    status,
    scanRunId: run.id,
    fetched: saved.fetched,
    newCount: saved.newCount,
    updatedCount: saved.updatedCount,
    duplicateCount: saved.duplicateCount,
    errorCount,
    errors,
  };
}
