import { describe, expect, it } from "vitest";
import { normalizeGupyJob } from "@/server/connectors/gupy";
import { normalizeRemotiveJob } from "@/server/connectors/remotive";
import { prepareJob } from "@/server/jobs/prepare";
import gupy from "./fixtures/gupy-search.json";
import remotive from "./fixtures/remotive-feed.json";

const base = { url: "https://acme.gupy.io/job/abc?utm_source=x", title: "Dev Front-end", company: "Acme", description: "<p>Vaga <b>React</b></p>" };

describe("prepareJob", () => {
  it("limpa tudo: texto puro, URL canônica, hash e campos inferidos", () => {
    const p = prepareJob({ ...base, title: "Desenvolvedor Front-end Júnior (remoto)" })!;
    expect(p.canonicalUrl).toBe("https://acme.gupy.io/job/abc");
    expect(p.originalUrl).toBe(base.url);
    expect(p.description).toBe("Vaga React");
    expect(p.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(p.seniority).toBe("JUNIOR");
    expect(p.workMode).toBe("REMOTE");
  });

  it("a fonte vence a inferência", () => {
    const p = prepareJob({ ...base, title: "Dev Júnior remoto", seniority: "MID", workMode: "ONSITE" })!;
    expect(p.seniority).toBe("MID");
    expect(p.workMode).toBe("ONSITE");
  });

  it("a mesma vaga com URLs de rastreamento diferentes tem a mesma identidade", () => {
    const a = prepareJob(base)!;
    const b = prepareJob({ ...base, url: "https://acme.gupy.io/job/abc/?ref=linkedin&jobBoardSource=gupy_portal" })!;
    expect(a.canonicalUrl).toBe(b.canonicalUrl);
    expect(a.contentHash).toBe(b.contentHash);
  });

  it("rejeita vaga sem URL válida, título ou empresa", () => {
    expect(prepareJob({ ...base, url: "não é url" })).toBeNull();
    expect(prepareJob({ ...base, title: "  " })).toBeNull();
    expect(prepareJob({ ...base, company: "<b></b>" })).toBeNull();
  });

  it("título e empresa viram uma linha só e nunca guardam HTML", () => {
    const p = prepareJob({ ...base, title: "Dev <script>alert(1)</script>\nFront-end", company: "Acme &amp; Cia" })!;
    expect(p.title).toBe("Dev Front-end");
    expect(p.company).toBe("Acme & Cia");
  });

  it("descrições reais da Gupy e do Remotive viram texto puro, sem tag nenhuma", () => {
    const jobs = [...gupy.data.map(normalizeGupyJob), ...remotive.jobs.map(normalizeRemotiveJob)];
    expect(jobs.length).toBeGreaterThan(10);
    for (const job of jobs) {
      const p = prepareJob(job!)!;
      expect(p).not.toBeNull();
      expect(p.description).not.toMatch(/<\/?[a-z][^>]*>/i);
      expect(p.description).not.toMatch(/&(amp|nbsp|lt|gt|quot);/);
      expect(p.description.length).toBeGreaterThan(50);
    }
  });

  it("vagas reais: senioridade e modalidade inferidas pelo título", () => {
    const sr = prepareJob(normalizeGupyJob(gupy.data.find((r) => r.id === 12754502))!)!;
    expect(sr.seniority).toBe("SENIOR"); // "FULLSTACK SR"
    expect(sr.workMode).toBe("HYBRID"); // vindo da fonte
    const pleno = prepareJob(normalizeGupyJob(gupy.data.find((r) => r.id === 4073543))!)!;
    expect(pleno.seniority).toBe("MID");
  });
});
