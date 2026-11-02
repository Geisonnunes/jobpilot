import { describe, expect, it } from "vitest";
import { extractJsonObject, parseMatchResponse, recommendationFor, verifyEvidence } from "@/server/ai/match/result";
import { RESUME_TEXT, validResult } from "./ai-helpers";

describe("parseMatchResponse", () => {
  it("aceita JSON válido, com cerca de markdown e texto em volta", () => {
    const json = JSON.stringify(validResult);
    expect(parseMatchResponse(json).ok).toBe(true);
    expect(parseMatchResponse("```json\n" + json + "\n```").ok).toBe(true);
    expect(parseMatchResponse("Aqui está:\n" + json + "\nFim.").ok).toBe(true);
  });
  it("arredonda a nota para uma casa decimal", () => {
    const r = parseMatchResponse(JSON.stringify({ ...validResult, score: 3.4567 }));
    expect(r.ok && r.result.score).toBe(3.5);
  });
  it("rejeita nota fora de 1–5, dimensão faltando e recomendação desconhecida", () => {
    expect(parseMatchResponse(JSON.stringify({ ...validResult, score: 6 })).ok).toBe(false);
    expect(parseMatchResponse(JSON.stringify({ ...validResult, score: 0.5 })).ok).toBe(false);
    const rest = { ...validResult.dimensions } as Partial<typeof validResult.dimensions>;
    delete rest.cvMatch;
    expect(parseMatchResponse(JSON.stringify({ ...validResult, dimensions: rest })).ok).toBe(false);
    expect(parseMatchResponse(JSON.stringify({ ...validResult, recommendation: "TALVEZ" })).ok).toBe(false);
  });
  it("rejeita texto sem JSON e JSON quebrado, sem ecoar o conteúdo", () => {
    for (const bad of ["sem json aqui SEGREDO-123", '{"score": 4,', ""]) {
      const r = parseMatchResponse(bad);
      expect(r.ok).toBe(false);
      expect(JSON.stringify(r)).not.toContain("SEGREDO-123");
    }
    expect(() => extractJsonObject("nada")).toThrow();
  });
});

describe("verifyEvidence", () => {
  it("mantém evidência literal (ignorando caixa e espaços) e remove a inventada", () => {
    const r = verifyEvidence(
      [
        { skill: "React", evidence: "projetos em React e TypeScript" },
        { skill: "Next.js", evidence: "LOJA   virtual em next.js" },
        { skill: "Docker", evidence: "orquestração com Docker Swarm" },
      ],
      RESUME_TEXT,
    );
    expect(r.matchedSkills.map((m) => m.skill)).toEqual(["React", "Next.js"]);
    expect(r.removed).toBe(1);
    expect(r.suspect).toBe(false);
  });
  it("marca como suspeita quando mais da metade é inválida", () => {
    const r = verifyEvidence(
      [{ skill: "A", evidence: "inventado um" }, { skill: "B", evidence: "inventado dois" }, { skill: "React", evidence: "projetos em React" }],
      RESUME_TEXT,
    );
    expect(r.removed).toBe(2);
    expect(r.suspect).toBe(true);
  });
  it("exatamente metade inválida não é suspeita; lista vazia também não", () => {
    expect(verifyEvidence([{ skill: "A", evidence: "inventado" }, { skill: "R", evidence: "projetos em React" }], RESUME_TEXT).suspect).toBe(false);
    expect(verifyEvidence([], RESUME_TEXT)).toMatchObject({ removed: 0, suspect: false });
  });
  it("rejeita evidência curtíssima", () => {
    expect(verifyEvidence([{ skill: "A", evidence: "a" }], RESUME_TEXT).removed).toBe(1);
  });
});

describe("recommendationFor", () => {
  it("APPLY >= mínimo, MAYBE >= mínimo − 1, senão SKIP", () => {
    expect(recommendationFor(4.0, 4.0)).toBe("APPLY");
    expect(recommendationFor(3.9, 4.0)).toBe("MAYBE");
    expect(recommendationFor(3.0, 4.0)).toBe("MAYBE");
    expect(recommendationFor(2.9, 4.0)).toBe("SKIP");
    expect(recommendationFor(3.5, 3.5)).toBe("APPLY");
    expect(recommendationFor(1.0, 1.0)).toBe("APPLY");
  });
});
