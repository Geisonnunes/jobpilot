import { describe, expect, it, vi } from "vitest";
import { buildKeywordTerms, extractRemotiveRows, isLocationEligible, matchesKeywords, normalizeRemotiveJob, remotiveConnector } from "@/server/connectors/remotive";
import type { ConnectorContext } from "@/server/connectors/types";
import fixture from "./fixtures/remotive-feed.json";

/** Contexto sem rede: devolve a fixture real (resposta do Remotive gravada em 2026-11-02). */
function ctxWith(body: unknown = fixture) {
  const urls: string[] = [];
  const ctx: ConnectorContext = {
    fetch: vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as ConnectorContext["fetch"],
    sleep: vi.fn(async () => {}),
    requestDelayMs: 1000,
    log: vi.fn(),
  };
  return { ctx, urls };
}

describe("normalizeRemotiveJob (fixture real)", () => {
  const rows = fixture.jobs as unknown[];

  it("normaliza todas as vagas, sempre com link do Remotive (atribuição obrigatória)", () => {
    const jobs = rows.map(normalizeRemotiveJob);
    expect(jobs.every(Boolean)).toBe(true);
    for (const job of jobs) {
      expect(new URL(job!.url).hostname).toBe("remotive.com");
      expect(job!.workMode).toBe("REMOTE");
    }
  });

  it("mapeia campos e trata a data sem fuso como UTC", () => {
    const job = normalizeRemotiveJob(rows[0])!;
    expect(job).toMatchObject({
      externalId: "2091165",
      title: "Full-Stack Developer",
      company: "Fluence International, Inc.",
      location: "Worldwide",
      employmentType: "Contrato", // job_type "contract" na fonte
    });
    expect(job.publishedAt?.toISOString()).toBe("2026-10-29T18:22:41.000Z");
    expect(job.tags).toContain("react");
    expect(job.tags).toContain("Typescript"); // espaço sobrando nas tags reais é removido
  });

  it("traduz job_type conhecido", () => {
    expect(normalizeRemotiveJob(rows[1])!.employmentType).toBe("Tempo integral");
  });
});

describe("normalizeRemotiveJob (casos de borda)", () => {
  const base = { id: 1, title: "Dev", url: "https://remotive.com/remote-jobs/x", company_name: "Acme", description: "<p>x</p>" };

  it("descarta URL que não é do Remotive ou título vazio", () => {
    expect(normalizeRemotiveJob({ ...base, url: "https://evil.com/x" })).toBeNull();
    expect(normalizeRemotiveJob({ ...base, url: "javascript:alert(1)" })).toBeNull();
    expect(normalizeRemotiveJob({ ...base, title: " " })).toBeNull();
    expect(normalizeRemotiveJob(undefined)).toBeNull();
  });

  it("empresa ausente ganha um nome padrão; data com fuso é respeitada", () => {
    const job = normalizeRemotiveJob({ ...base, company_name: "", publication_date: "2026-10-29T18:22:41-03:00" })!;
    expect(job.company).toBe("Empresa não informada");
    expect(job.publishedAt?.toISOString()).toBe("2026-10-29T21:22:41.000Z");
  });

  it("extractRemotiveRows exige { jobs: [...] }", () => {
    expect(extractRemotiveRows({ jobs: [] })).toEqual([]);
    expect(() => extractRemotiveRows({ data: [] })).toThrow(/esperado \{ jobs/);
  });
});

describe("filtros locais", () => {
  it("buildKeywordTerms tira palavras genéricas e junta front-end", () => {
    expect(buildKeywordTerms(["Desenvolvedor Front-end", "Front-end Developer", "React", "Next.js"])).toEqual(["frontend", "react", "next.js"]);
  });

  it("isLocationEligible: para o Brasil aceita Worldwide/LATAM e recusa regiões fechadas", () => {
    expect(isLocationEligible("Worldwide", "BR")).toBe(true);
    expect(isLocationEligible("Brazil", "BR")).toBe(true);
    expect(isLocationEligible("LATAM", "BR")).toBe(true);
    expect(isLocationEligible("", "BR")).toBe(true);
    expect(isLocationEligible("USA, Canada", "BR")).toBe(false);
    expect(isLocationEligible("Europe, USA, Canada, APAC", "BR")).toBe(false);
    expect(isLocationEligible("USA", "US")).toBe(true); // sem restrição para outros países
  });

  it("tags só valem para vagas de software (as tags reais são ruidosas)", () => {
    const office = normalizeRemotiveJob({ id: 9, title: "Remote Office Assistant", url: "https://remotive.com/x", company_name: "A", tags: ["frontend", "css"] })!;
    expect(matchesKeywords(office, ["frontend"], "Marketing")).toBe(false);
    const dev = normalizeRemotiveJob({ id: 8, title: "Full-Stack Developer", url: "https://remotive.com/y", company_name: "A", tags: ["react"] })!;
    expect(matchesKeywords(dev, ["react"], "Software Development")).toBe(true);
    expect(matchesKeywords(dev, ["react"], "Sales")).toBe(false);
    expect(matchesKeywords({ ...dev, title: "Senior React Engineer" }, ["react"], "Sales")).toBe(true); // título vale sempre
  });
});

describe("remotiveConnector.search (sem rede)", () => {
  it("faz UMA requisição ao feed (limite de uso da API) e só chama o host permitido", async () => {
    const { ctx, urls } = ctxWith();
    await remotiveConnector.search({ keywords: ["Desenvolvedor Front-end", "React", "TypeScript"], country: "BR" }, ctx);
    expect(urls).toEqual(["https://remotive.com/api/remote-jobs"]);
    expect(remotiveConnector.allowedHosts).toEqual(["remotive.com"]);
  });

  it("para o Brasil, exclui vagas restritas a outras regiões", async () => {
    const { ctx } = ctxWith();
    const jobs = await remotiveConnector.search({ keywords: ["React", "backend", "rails"], country: "BR" }, ctx);
    const titles = jobs.map((j) => j.title);
    expect(titles).toContain("Full-Stack Developer"); // Worldwide + tag react + categoria de software
    expect(titles).not.toContain("Senior Back-end Developer"); // Europe, USA, Canada…
    expect(titles).not.toContain("Tech Lead Full-Stack Rails Engineer"); // USA, Canada
    expect(titles).not.toContain("Remote Office Assistant"); // tags não valem fora de software
  });

  it("sem restrição de país, aplica só as palavras-chave", async () => {
    const { ctx } = ctxWith();
    const jobs = await remotiveConnector.search({ keywords: ["react"], country: "US" }, ctx);
    expect(jobs.map((j) => j.title)).toEqual(expect.arrayContaining(["Full-Stack Developer", "Senior Back-end Developer", "Senior React Full-stack Developer"]));
  });

  it("não devolve nada se o perfil não aceita vagas remotas", async () => {
    const { ctx } = ctxWith();
    expect(await remotiveConnector.search({ keywords: ["react"], workModes: ["ONSITE", "HYBRID"] }, ctx)).toEqual([]);
  });

  it("respeita maxResults e since", async () => {
    expect((await remotiveConnector.search({ keywords: ["react"], maxResults: 1 }, ctxWith().ctx))).toHaveLength(1);
    const recent = await remotiveConnector.search({ keywords: ["react"], since: new Date("2026-10-28T00:00:00Z") }, ctxWith().ctx);
    expect(recent.map((j) => j.title)).toEqual(["Full-Stack Developer"]);
  });

  it("resposta fora do formato é erro explícito", async () => {
    await expect(remotiveConnector.search({ keywords: ["react"] }, ctxWith({ erro: 1 }).ctx)).rejects.toThrow(/resposta inesperada/);
  });
});
