import { describe, expect, it } from "vitest";
import { currentRecommendation } from "@/server/ai/match/view";
import { buildJobsWhere, parseFilters } from "@/server/jobs/list";

describe("currentRecommendation (nota mínima ATUAL do perfil)", () => {
  it("recalcula a partir da nota, ignorando a recomendação gravada", () => {
    // gravada como SKIP quando o mínimo era 4.0; o usuário baixou o mínimo para 2.5
    expect(currentRecommendation(2.8, 2.5, "SKIP")).toBe("APPLY");
    // gravada como APPLY com mínimo 2.5; o usuário subiu o mínimo para 4.0
    expect(currentRecommendation(3.0, 4.0, "APPLY")).toBe("MAYBE");
    expect(currentRecommendation(2.8, 4.0, "APPLY")).toBe("SKIP");
  });
  it("respeita os limiares: APPLY >= mínimo, MAYBE >= mínimo − 1", () => {
    expect(currentRecommendation(4.0, 4.0, "SKIP")).toBe("APPLY");
    expect(currentRecommendation(3.0, 4.0, "SKIP")).toBe("MAYBE");
    expect(currentRecommendation(2.9, 4.0, "APPLY")).toBe("SKIP");
  });
  it("aceita Decimal como string (como vem do Prisma)", () => {
    expect(currentRecommendation("3.0", "3.0", "SKIP")).toBe("APPLY");
    expect(currentRecommendation("2.8", "3.0", "APPLY")).toBe("MAYBE");
  });
  it("sem perfil (ou valor inválido), usa a recomendação gravada", () => {
    expect(currentRecommendation(3.0, null, "MAYBE")).toBe("MAYBE");
    expect(currentRecommendation(3.0, undefined, "SKIP")).toBe("SKIP");
    expect(currentRecommendation(3.0, "abc", "APPLY")).toBe("APPLY");
  });
});

describe("filtro 'Somente recomendadas'", () => {
  const scope = { resumeId: "r1", promptVersion: "match-v1", minMatchScore: 3.0 };

  it("filtra pela nota >= nota mínima atual, não pela recomendação gravada", () => {
    const where = buildJobsWhere(parseFilters({ recommended: "1" }), "u1", null, scope);
    const json = JSON.stringify(where);
    expect(json).toContain('"score":{"gte":"3.0"}');
    expect(json).not.toContain("recommendation");
    expect(json).toContain('"userId":"u1"');
    expect(json).toContain('"resumeId":"r1"');
    expect(json).toContain('"promptVersion":"match-v1"');
  });
  it("muda junto com a nota mínima do perfil", () => {
    const at = (min: number) => JSON.stringify(buildJobsWhere(parseFilters({ recommended: "1" }), "u1", null, { ...scope, minMatchScore: min }));
    expect(at(2.5)).toContain('"gte":"2.5"');
    expect(at(4)).toContain('"gte":"4.0"');
  });
  it("sem CV principal a lista fica vazia, e sem o filtro não há condição de nota", () => {
    expect(JSON.stringify(buildJobsWhere(parseFilters({ recommended: "1" }), "u1", null))).toContain('"id":""');
    expect(JSON.stringify(buildJobsWhere(parseFilters({}), "u1", null, scope))).not.toContain("score");
  });
});
