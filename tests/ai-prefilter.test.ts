import { describe, expect, it } from "vitest";
import { prefilterPosting, type PrefilterPosting, type PrefilterProfile } from "@/server/ai/prefilter";

const profile: PrefilterProfile = { excludeKeywords: ["PHP", "Sênior"], seniority: "JUNIOR", workModes: ["REMOTE", "HYBRID"] };
const posting = (over: Partial<PrefilterPosting> = {}): PrefilterPosting => ({
  status: "OPEN", title: "Desenvolvedor Front-end", description: "x".repeat(250), seniority: "JUNIOR", workMode: "REMOTE", ...over,
});

describe("prefilterPosting", () => {
  it("aprova uma vaga compatível", () => {
    expect(prefilterPosting(posting(), profile)).toEqual({ pass: true });
  });
  it("barra vaga fechada", () => {
    expect(prefilterPosting(posting({ status: "CLOSED" }), profile)).toMatchObject({ pass: false, code: "CLOSED" });
  });
  it("barra palavra excluída no título, ignorando acento e caixa", () => {
    expect(prefilterPosting(posting({ title: "Dev SENIOR React" }), profile)).toMatchObject({ pass: false, code: "EXCLUDED_KEYWORD" });
  });
  it("não barra palavra excluída só na descrição", () => {
    expect(prefilterPosting(posting({ description: "Conhecimento em PHP é um plus. ".repeat(10) }), profile).pass).toBe(true);
  });
  it("barra senioridade acima da desejada, mas aceita igual/abaixo/desconhecida", () => {
    expect(prefilterPosting(posting({ seniority: "MID" }), profile)).toMatchObject({ pass: false, code: "SENIORITY_ABOVE" });
    expect(prefilterPosting(posting({ seniority: "INTERN" }), profile).pass).toBe(true);
    expect(prefilterPosting(posting({ seniority: null }), profile).pass).toBe(true);
  });
  it("barra modalidade incompatível, aceita desconhecida", () => {
    expect(prefilterPosting(posting({ workMode: "ONSITE" }), profile)).toMatchObject({ pass: false, code: "WORK_MODE" });
    expect(prefilterPosting(posting({ workMode: null }), profile).pass).toBe(true);
  });
  it("barra descrição curta (< 200 caracteres)", () => {
    expect(prefilterPosting(posting({ description: "x".repeat(199) }), profile)).toMatchObject({ pass: false, code: "NO_DESCRIPTION" });
    expect(prefilterPosting(posting({ description: "x".repeat(200) }), profile).pass).toBe(true);
  });
  it("sempre devolve um motivo legível", () => {
    const r = prefilterPosting(posting({ status: "CLOSED" }), profile);
    expect(r.pass === false && r.reason.length).toBeGreaterThan(5);
  });
});

describe("prefilterPosting: região", () => {
  const sp: PrefilterProfile = { excludeKeywords: [], seniority: "JUNIOR", workModes: ["REMOTE", "HYBRID", "ONSITE"], state: "SP" };
  const job = (over: Partial<PrefilterPosting> = {}): PrefilterPosting => ({
    status: "OPEN", title: "Dev", description: "x".repeat(250), seniority: "JUNIOR", workMode: "HYBRID", state: "Paraná", ...over,
  });

  it("híbrida ou presencial em outra UF: 'Fora da sua região'", () => {
    for (const workMode of ["HYBRID", "ONSITE"] as const) {
      const r = prefilterPosting(job({ workMode }), sp);
      expect(r).toMatchObject({ pass: false, code: "REGION" });
      expect(r.pass === false && r.reason).toMatch(/Fora da sua região/);
    }
  });
  it("aceita estado por extenso (como a Gupy envia) ou sigla, com ou sem acento", () => {
    expect(prefilterPosting(job({ state: "Rio Grande do Sul" }), sp).pass).toBe(false);
    expect(prefilterPosting(job({ state: "RS" }), sp).pass).toBe(false);
    expect(prefilterPosting(job({ state: "São Paulo" }), sp).pass).toBe(true);
    expect(prefilterPosting(job({ state: "sao paulo" }), sp).pass).toBe(true);
    expect(prefilterPosting(job({ state: "SP" }), sp).pass).toBe(true);
  });
  it("remota não é afetada, mesmo em outra UF", () => {
    expect(prefilterPosting(job({ workMode: "REMOTE", state: "Paraná" }), sp).pass).toBe(true);
  });
  it("vaga sem UF (ou UF desconhecida) não é descartada", () => {
    expect(prefilterPosting(job({ state: null }), sp).pass).toBe(true);
    expect(prefilterPosting(job({ state: "" }), sp).pass).toBe(true);
    expect(prefilterPosting(job({ state: undefined }), sp).pass).toBe(true);
    expect(prefilterPosting(job({ state: "Atlântida" }), sp).pass).toBe(true);
  });
  it("perfil sem UF não restringe; modalidade desconhecida também não", () => {
    expect(prefilterPosting(job(), { ...sp, state: null }).pass).toBe(true);
    expect(prefilterPosting(job({ workMode: null }), sp).pass).toBe(true);
  });
});
