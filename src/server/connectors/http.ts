/**
 * Cliente HTTP resiliente para os conectores.
 *
 * Adaptado de providers/_http.mjs do Career Ops (retry com backoff exponencial e
 * jitter, Retry-After limitado, redirect bloqueado). Veja THIRD_PARTY_NOTICES.md.
 *
 * - allowlist de hosts por conector (https apenas);
 * - timeout por requisição;
 * - retry em 429, 5xx e erros de rede; outros 4xx não são repetidos;
 * - respeita Retry-After, mas limitado, para um valor hostil não travar a coleta;
 * - nunca segue redirecionamentos (redirect: "error").
 */
import type { ConnectorContext } from "./types";

export const USER_AGENT = "JobPilot/0.1 (assistente pessoal de busca de vagas; uso individual)";

export class HttpError extends Error {
  status?: number;
  retryAfter?: string | null;
  attempts?: number;
  constructor(message: string, init: { status?: number; retryAfter?: string | null } = {}) {
    super(message);
    this.name = "HttpError";
    this.status = init.status;
    this.retryAfter = init.retryAfter;
  }
}

const JITTER_MS = 250;

export interface HttpOptions {
  allowedHosts: readonly string[];
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  timeoutMs?: number;
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  signal?: AbortSignal;
  /** Observa respostas 2xx (usado só para gravar fixtures em desenvolvimento). */
  onResponse?: (url: string, response: Response) => void | Promise<void>;
}

export const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Milissegundos de um Retry-After (segundos ou data HTTP); null se ausente/inválido. */
export function parseRetryAfterMs(value: string | null | undefined, now = Date.now()): number | null {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - now) : null;
}

/** True se a URL é https e o host está na allowlist (exato ou "*.dominio"). */
export function isHostAllowed(rawUrl: string, allowedHosts: readonly string[]): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return allowedHosts.some((entry) => {
    const e = entry.toLowerCase();
    return e.startsWith("*.") ? host.endsWith(e.slice(1)) && host.length > e.length - 1 : host === e;
  });
}

function isRetryable(err: unknown): boolean {
  if (err instanceof HttpError) return err.status === 429 || (typeof err.status === "number" && err.status >= 500);
  // Erros de rede e timeout não têm status. Um redirecionamento recusado é determinístico.
  const cause = (err as { cause?: { message?: string } } | undefined)?.cause?.message;
  if (typeof cause === "string" && cause.includes("unexpected redirect")) return false;
  return true;
}

/** Cria um `fetch` com allowlist, timeout, retry/backoff e Retry-After. */
export function createHttpFetch(options: HttpOptions): ConnectorContext["fetch"] {
  const {
    allowedHosts,
    fetchImpl = fetch,
    sleep = defaultSleep,
    random = Math.random,
    timeoutMs = 15_000,
    retries = 2,
    baseDelayMs = 500,
    maxDelayMs = 8_000,
    signal,
    onResponse,
  } = options;

  return async (url, init = {}) => {
    if (!isHostAllowed(url, allowedHosts)) {
      let host = "inválido";
      try {
        host = new URL(url).hostname;
      } catch {}
      throw new HttpError(`Host não permitido para este conector: ${host}`);
    }

    for (let attempt = 0; ; attempt++) {
      try {
        const timeout = AbortSignal.timeout(timeoutMs);
        const res = await fetchImpl(url, {
          ...init,
          redirect: "error",
          headers: { Accept: "application/json", ...init.headers, "User-Agent": USER_AGENT },
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
        if (!res.ok) {
          throw new HttpError(`HTTP ${res.status} em ${new URL(url).hostname}`, {
            status: res.status,
            retryAfter: res.headers.get("retry-after"),
          });
        }
        await onResponse?.(url, res.clone());
        return res;
      } catch (err) {
        if (err instanceof HttpError) err.attempts = attempt + 1;
        if (attempt >= retries || !isRetryable(err) || signal?.aborted) throw err;

        // O teto do backoff desconta o jitter, para o total nunca passar de maxDelayMs.
        const jitter = Math.min(JITTER_MS, Math.max(0, maxDelayMs));
        const backoff = Math.min(baseDelayMs * 2 ** attempt, Math.max(0, maxDelayMs - jitter));
        const retryAfterMs = err instanceof HttpError ? parseRetryAfterMs(err.retryAfter) : null;
        const delay = retryAfterMs !== null ? Math.min(retryAfterMs, maxDelayMs * 4) : backoff + random() * jitter;
        await sleep(delay);
      }
    }
  };
}

/** GET que devolve JSON. Só chega aqui se a resposta foi 2xx. */
export async function fetchJson(ctx: ConnectorContext, url: string): Promise<unknown> {
  const res = await ctx.fetch(url);
  try {
    return await res.json();
  } catch {
    throw new HttpError("A resposta não é um JSON válido.");
  }
}

export interface ContextOptions extends HttpOptions {
  requestDelayMs: number;
  log?: ConnectorContext["log"];
}

/** Monta o ConnectorContext usado pela coleta. */
export function createConnectorContext(options: ContextOptions): ConnectorContext {
  const sleep = options.sleep ?? defaultSleep;
  return {
    fetch: createHttpFetch(options),
    sleep,
    requestDelayMs: options.requestDelayMs,
    log: options.log ?? (() => {}),
    signal: options.signal,
  };
}
