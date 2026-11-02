import { describe, expect, it, vi } from "vitest";
import { buildGupyLocation, buildGupyUrl, extractGupyRows, gupyConnector, isSafeGupyUrl, normalizeGupyJob, pageIsPastWindow } from "@/server/connectors/gupy";
import { HttpError } from "@/server/connectors/http";
import type { ConnectorContext } from "@/server/connectors/types";
import fixture from "./fixtures/gupy-search.json";

/** Contexto sem rede: devolve a fixture real (resposta da Gupy gravada em 2026-11-02). */
function ctxWith(responder: (url: string) => unknown) {
  const urls: string[] = [];
  const ctx: ConnectorContext = {
    fetch: vi.fn(async (url: string) => {
      urls.push(url);
      const body = responder(url);
      if (body instanceof Error) throw body;
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as ConnectorContext["fetch"],
    sleep: vi.fn(async () => {}),
    requestDelayMs: 1000,
    log: vi.fn(),
  };
  return { ctx, urls };
}

describe("normalizeGupyJob (fixture real)", () => {
  const rows = fixture.data as unknown[];

  it("normaliza todas as vagas da resposta real", () => {
    const jobs = rows.map(normalizeGupyJob);
    expect(jobs.every(Boolean)).toBe(true);
    for (const job of jobs) {
      expect(isSafeGupyUrl(job!.url)).toBe(true);
      expect(job!.title).not.toBe("");
      expect(job!.company).not.toBe("");
      expect(job!.externalId).toMatch(/^\d+$/);
      expect(job!.description.length).toBeGreaterThan(0);
    }
  });

  it("mapeia campos de uma vaga remota", () => {
    const job = normalizeGupyJob(rows[0])!;
    expect(job).toMatchObject({
      externalId: "12816323",
      title: "Software Engineer Backend (.Net/React)",
      company: "SoftDesign",
      workMode: "REMOTE",
      employmentType: "CLT",
      location: "Remoto",
      country: "BR",
    });
    expect(new URL(job.url).hostname).toBe("softdesign.gupy.io");
    expect(job.publishedAt?.toISOString()).toBe("2026-10-30T20:36:27.492Z");
    expect(job.city).toBeUndefined();
  });

  it("mapeia uma vaga híbrida com cidade e estado", () => {
    const job = normalizeGupyJob(rows.find((r) => (r as { id: number }).id === 12754502))!;
    expect(job).toMatchObject({ workMode: "HYBRID", city: "Brasília", state: "Distrito Federal", location: "Híbrido, Brasília, Distrito Federal" });
  });

  it("traduz os tipos de contratação vistos na coleta real", () => {
    const byId = (id: number) => normalizeGupyJob(rows.find((r) => (r as { id: number }).id === id))!;
    expect(byId(12776564).employmentType).toBe("Temporário");
    expect(byId(12691103).employmentType).toBe("PJ");
    expect(byId(10939233).employmentType).toBe("Autônomo");
    expect(byId(9186882).employmentType).toBe("Banco de talentos");
  });

  it("a descrição vem em HTML e a camada de ingestão converte (não é papel do conector)", () => {
    const job = normalizeGupyJob(rows[0])!;
    expect(typeof job.description).toBe("string");
  });
});

describe("normalizeGupyJob (casos de borda)", () => {
  const base = { id: 1, name: "Dev", careerPageName: "Acme", jobUrl: "https://acme.gupy.io/job/abc", workplaceType: "remote", description: "<p>x</p>" };

  it("descarta vagas confidenciais", () => {
    expect(normalizeGupyJob({ ...base, careerPageName: "Confidencial" })).toBeNull();
    expect(normalizeGupyJob({ ...base, careerPageName: "Empresa Confidencial" })).toBeNull();
    expect(normalizeGupyJob({ ...base, isConfidentialCareerPage: true })).toBeNull();
    expect(normalizeGupyJob({ ...base, careerPageName: "Confidencial Seguros S.A." })).not.toBeNull();
  });

  it("descarta URL que não é https em *.gupy.io", () => {
    expect(normalizeGupyJob({ ...base, jobUrl: "http://acme.gupy.io/job/abc" })).toBeNull();
    expect(normalizeGupyJob({ ...base, jobUrl: "https://evil.com/job/abc" })).toBeNull();
    expect(normalizeGupyJob({ ...base, jobUrl: "https://gupy.io.evil.com/job" })).toBeNull();
    expect(normalizeGupyJob({ ...base, jobUrl: "javascript:alert(1)" })).toBeNull();
  });

  it("descarta vagas sem título, sem empresa ou que não são objetos", () => {
    expect(normalizeGupyJob({ ...base, name: "  " })).toBeNull();
    expect(normalizeGupyJob({ ...base, careerPageName: "" })).toBeNull();
    expect(normalizeGupyJob(null)).toBeNull();
    expect(normalizeGupyJob("texto")).toBeNull();
  });

  it("estágio vira senioridade INTERN", () => {
    expect(normalizeGupyJob({ ...base, type: "vacancy_type_internship" })).toMatchObject({ seniority: "INTERN", employmentType: "Estágio" });
  });

  it("tipo desconhecido passa como veio; data inválida é omitida", () => {
    const job = normalizeGupyJob({ ...base, type: "vacancy_type_novo", publishedDate: "ontem" })!;
    expect(job.employmentType).toBe("vacancy_type_novo");
    expect(job.publishedAt).toBeUndefined();
  });

  it("buildGupyLocation e extractGupyRows", () => {
    expect(buildGupyLocation({ isRemoteWork: true, city: "SP" })).toBe("Remoto, SP");
    expect(extractGupyRows({ data: [] }, "x", 0)).toEqual([]);
    expect(() => extractGupyRows({ results: [] }, "react", 2)).toThrow(/esperado \{ data/);
    expect(() => extractGupyRows(null, "react", 0)).toThrow(/null/);
  });
});

describe("gupyConnector.search (sem rede)", () => {
  it("monta a URL com palavra-chave, limite 100 e modalidades", () => {
    const url = new URL(buildGupyUrl("React", 2, ["REMOTE", "HYBRID", "ONSITE"]));
    expect(url.origin + url.pathname).toBe("https://portal.gupy.io/api/job-search/jobs");
    expect(Object.fromEntries(url.searchParams)).toEqual({ jobName: "React", offset: "200", limit: "100", workplaceType: "remote,hybrid,on-site" });
    expect(new URL(buildGupyUrl("React", 0)).searchParams.has("workplaceType")).toBe(false);
  });

  it("só chama a allowlist da Gupy", () => {
    expect(gupyConnector.allowedHosts).toEqual(["portal.gupy.io"]);
  });

  it("uma busca por palavra-chave, deduplica por URL e para na página curta (<100)", async () => {
    const { ctx, urls } = ctxWith(() => fixture);
    const jobs = await gupyConnector.search({ keywords: ["React", "Front-end", "react"], country: "BR", workModes: ["REMOTE"] }, ctx);
    expect(urls).toHaveLength(2); // "react" repetida entra uma vez; páginas curtas não paginam
    expect(new URL(urls[0]).searchParams.get("workplaceType")).toBe("remote");
    expect(jobs).toHaveLength(fixture.data.length); // a 2ª busca devolve as mesmas vagas: sem duplicatas
    expect(new Set(jobs.map((j) => j.url)).size).toBe(jobs.length);
    expect(ctx.sleep).toHaveBeenCalledWith(1000); // requestDelayMs entre requisições
  });

  it("limita a 6 palavras-chave (e a 6 requisições) e respeita maxResults", async () => {
    const { ctx, urls } = ctxWith(() => fixture);
    await gupyConnector.search({ keywords: ["a", "b", "c", "d", "e", "f", "g", "h"], maxResults: 500 }, ctx);
    expect(urls).toHaveLength(6);
    expect(urls.map((u) => new URL(u).searchParams.get("jobName"))).toEqual(["a", "b", "c", "d", "e", "f"]);

    const capped = ctxWith(() => fixture);
    const jobs = await gupyConnector.search({ keywords: ["a", "b", "c"], maxResults: 4 }, capped.ctx);
    expect(jobs).toHaveLength(4);
  });

  it("pagina em rodadas: a página 0 de todos os termos vem antes da página 1 de qualquer um", async () => {
    const full = { data: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `Dev ${i}`, careerPageName: "Acme", jobUrl: `https://acme.gupy.io/job/${i}`, description: "" })) };
    const { ctx, urls } = ctxWith((url) => (new URL(url).searchParams.get("offset") === "0" ? full : { data: [] }));
    await gupyConnector.search({ keywords: ["a", "b", "c"], maxResults: 500 }, ctx);
    const seq = urls.map((u) => `${new URL(u).searchParams.get("jobName")}@${new URL(u).searchParams.get("offset")}`);
    expect(seq).toEqual(["a@0", "b@0", "c@0", "a@100", "b@100", "c@100"]);
  });

  it("marca cada vaga com a palavra-chave que a trouxe", async () => {
    const { ctx } = ctxWith(() => fixture);
    const jobs = await gupyConnector.search({ keywords: ["React", "Front-end"] }, ctx);
    expect(jobs.every((j) => j.sourceKeyword === "React")).toBe(true); // a 2ª busca só repete as mesmas URLs
  });

  it("filtra por since e ignora país que não é o Brasil", async () => {
    const { ctx } = ctxWith(() => fixture);
    const recent = await gupyConnector.search({ keywords: ["React"], since: new Date("2026-10-15T00:00:00Z") }, ctx);
    expect(recent.length).toBeGreaterThan(0);
    expect(recent.every((j) => j.publishedAt!.getTime() >= Date.parse("2026-10-15T00:00:00Z"))).toBe(true);

    const other = ctxWith(() => fixture);
    expect(await gupyConnector.search({ keywords: ["React"], country: "PT" }, other.ctx)).toEqual([]);
    expect(other.urls).toHaveLength(0);
  });

  it("pagina quando a página vem cheia (100)", async () => {
    const full = { data: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `Dev ${i}`, careerPageName: "Acme", jobUrl: `https://acme.gupy.io/job/${i}`, description: "" })), pagination: { total: 100 } };
    const { ctx, urls } = ctxWith((url) => (new URL(url).searchParams.get("offset") === "0" ? full : { data: [] }));
    const jobs = await gupyConnector.search({ keywords: ["x"], maxResults: 500 }, ctx);
    expect(urls.map((u) => new URL(u).searchParams.get("offset"))).toEqual(["0", "100"]);
    expect(jobs).toHaveLength(100);
  });

  it("uma busca que falha vira aviso e as outras continuam (coleta parcial)", async () => {
    let n = 0;
    const { ctx } = ctxWith(() => (n++ === 0 ? new HttpError("HTTP 500", { status: 500 }) : fixture));
    const jobs = await gupyConnector.search({ keywords: ["a", "b"] }, ctx);
    expect(jobs.length).toBeGreaterThan(0);
    expect(ctx.log).toHaveBeenCalledWith(expect.stringContaining("interrompida"), { level: "warn" });
  });

  it("se TODAS as buscas falham, lança o erro (não finge que são zero vagas)", async () => {
    const { ctx } = ctxWith(() => new HttpError("HTTP 503", { status: 503 }));
    await expect(gupyConnector.search({ keywords: ["a", "b"] }, ctx)).rejects.toThrow(/HTTP 503/);
  });

  it("resposta fora do formato também é erro explícito", async () => {
    const { ctx } = ctxWith(() => ({ erro: true }));
    await expect(gupyConnector.search({ keywords: ["a"] }, ctx)).rejects.toThrow(/resposta inesperada/);
  });

  it("sem palavras-chave, falha cedo", async () => {
    const { ctx } = ctxWith(() => fixture);
    await expect(gupyConnector.search({ keywords: ["  "] }, ctx)).rejects.toThrow(/palavra-chave/);
  });
});

describe("pageIsPastWindow", () => {
  it("só para quando a página inteira passou da janela (com margem de 2 dias)", () => {
    const day = 86_400_000;
    const cutoff = Date.parse("2026-10-10T00:00:00Z");
    const job = (offsetDays: number) => ({ publishedAt: new Date(cutoff + offsetDays * day) }) as never;
    expect(pageIsPastWindow([job(-5), job(-9)], cutoff)).toBe(true);
    expect(pageIsPastWindow([job(-1), job(-9)], cutoff)).toBe(true); // o mais antigo já passou da margem
    expect(pageIsPastWindow([job(-1), job(3)], cutoff)).toBe(false);
    expect(pageIsPastWindow([], cutoff)).toBe(false);
    expect(pageIsPastWindow([job(-9)], null)).toBe(false);
  });
});
