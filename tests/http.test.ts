import { describe, expect, it, vi } from "vitest";
import { createHttpFetch, HttpError, isHostAllowed, parseRetryAfterMs, USER_AGENT } from "@/server/connectors/http";

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, ...init });
const fast = { sleep: vi.fn(async () => {}), random: () => 0.5 };
const asFetch = (fn: unknown) => fn as typeof fetch;

describe("isHostAllowed", () => {
  it("só aceita https e hosts da allowlist", () => {
    expect(isHostAllowed("https://portal.gupy.io/api", ["portal.gupy.io"])).toBe(true);
    expect(isHostAllowed("http://portal.gupy.io/api", ["portal.gupy.io"])).toBe(false);
    expect(isHostAllowed("https://evil.com/api", ["portal.gupy.io"])).toBe(false);
    expect(isHostAllowed("https://portal.gupy.io.evil.com/", ["portal.gupy.io"])).toBe(false);
    expect(isHostAllowed("https://u:p@portal.gupy.io/", ["portal.gupy.io"])).toBe(false);
    expect(isHostAllowed("https://a.gupy.io/", ["*.gupy.io"])).toBe(true);
    expect(isHostAllowed("https://gupy.io/", ["*.gupy.io"])).toBe(false);
    expect(isHostAllowed("não é url", ["portal.gupy.io"])).toBe(false);
  });
});

describe("parseRetryAfterMs", () => {
  it("aceita segundos e data HTTP", () => {
    expect(parseRetryAfterMs("5")).toBe(5000);
    expect(parseRetryAfterMs("Wed, 21 Oct 2026 07:28:10 GMT", Date.parse("Wed, 21 Oct 2026 07:28:00 GMT"))).toBe(10_000);
    expect(parseRetryAfterMs("lixo")).toBeNull();
    expect(parseRetryAfterMs(null)).toBeNull();
  });
});

describe("createHttpFetch", () => {
  it("bloqueia host fora da allowlist sem chamar a rede", async () => {
    const fetchImpl = vi.fn();
    const f = createHttpFetch({ allowedHosts: ["a.com"], fetchImpl: asFetch(fetchImpl), ...fast });
    await expect(f("https://b.com/x")).rejects.toThrow(/Host não permitido/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("envia o User-Agent do JobPilot e não segue redirecionamentos", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({ ok: true }));
    const f = createHttpFetch({ allowedHosts: ["a.com"], fetchImpl: asFetch(fetchImpl), ...fast });
    await f("https://a.com/x");
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe(USER_AGENT);
    expect(init.redirect).toBe("error");
  });

  it("repete em 503 e 429 com backoff exponencial e devolve a resposta quando funciona", async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(json({ ok: 1 }));
    const f = createHttpFetch({ allowedHosts: ["a.com"], fetchImpl: asFetch(fetchImpl), sleep, random: () => 0 });
    const res = await f("https://a.com/x");
    expect(await res.json()).toEqual({ ok: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([500, 1000]);
  });

  it("respeita Retry-After, limitado a 4× o teto", async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "3" } }))
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "86400" } }))
      .mockResolvedValueOnce(json({}));
    const f = createHttpFetch({ allowedHosts: ["a.com"], fetchImpl: asFetch(fetchImpl), sleep, random: () => 0 });
    await f("https://a.com/x");
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([3000, 32_000]);
  });

  it("não repete 404 e desiste depois das tentativas em 500", async () => {
    const notFound = vi.fn(async () => new Response("", { status: 404 }));
    const f1 = createHttpFetch({ allowedHosts: ["a.com"], fetchImpl: asFetch(notFound), ...fast });
    await expect(f1("https://a.com/x")).rejects.toMatchObject({ status: 404 });
    expect(notFound).toHaveBeenCalledTimes(1);

    const broken = vi.fn(async () => new Response("", { status: 500 }));
    const f2 = createHttpFetch({ allowedHosts: ["a.com"], fetchImpl: asFetch(broken), retries: 2, ...fast });
    const err = await f2("https://a.com/x").catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(500);
    expect(err.attempts).toBe(3);
    expect(broken).toHaveBeenCalledTimes(3);
  });

  it("repete erros de rede, mas não um redirecionamento recusado", async () => {
    const flaky = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(json({ ok: 1 }));
    const f = createHttpFetch({ allowedHosts: ["a.com"], fetchImpl: asFetch(flaky), ...fast });
    expect((await f("https://a.com/x")).ok).toBe(true);

    const redirect = vi.fn(async () => {
      throw new TypeError("fetch failed", { cause: new Error("unexpected redirect") });
    });
    const f2 = createHttpFetch({ allowedHosts: ["a.com"], fetchImpl: asFetch(redirect), ...fast });
    await expect(f2("https://a.com/x")).rejects.toThrow();
    expect(redirect).toHaveBeenCalledTimes(1);
  });
});
