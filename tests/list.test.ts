import { describe, expect, it } from "vitest";
import { buildJobsWhere, daysAgoLabel, filtersToQuery, isHttpUrl, parseFilters } from "@/server/jobs/list";
import { buildQueryFromProfile } from "@/server/jobs/query";

describe("parseFilters", () => {
  it("usa padrões seguros: abertas, compatíveis ligado, página 1", () => {
    expect(parseFilters({})).toEqual({ q: "", source: "", mode: "", level: "", status: "OPEN", compat: true, page: 1 });
  });

  it("descarta valores inválidos e aceita os válidos", () => {
    const f = parseFilters({ q: "  react ", source: "gupy", mode: "XYZ", level: "JUNIOR", status: "ALL", compat: "0", page: "abc" });
    expect(f).toMatchObject({ q: "react", source: "gupy", mode: "", level: "JUNIOR", status: "ALL", compat: false, page: 1 });
    expect(parseFilters({ page: "-3" }).page).toBe(1);
    expect(parseFilters({ page: "4" }).page).toBe(4);
    expect(parseFilters({ source: "../x;drop" }).source).toBe("");
  });
});

describe("buildJobsWhere", () => {
  const profile = { excludeKeywords: ["Sênior", "PHP"], seniority: "JUNIOR" as const };

  it("sempre limita às vagas coletadas + manuais do próprio usuário", () => {
    const w = buildJobsWhere(parseFilters({ compat: "0", status: "ALL" }), "u1", null);
    expect(w).toEqual({ AND: [{ OR: [{ addedByUserId: null }, { addedByUserId: "u1" }] }] });
  });

  it("'compatíveis' exclui palavras no título e senioridade acima da desejada", () => {
    const json = JSON.stringify(buildJobsWhere(parseFilters({}), "u1", profile));
    expect(json).toContain('"title":{"contains":"Sênior","mode":"insensitive"}');
    expect(json).toContain('"title":{"contains":"PHP","mode":"insensitive"}');
    expect(json).toContain('"seniority":{"in":["INTERN","JUNIOR"]}');
    expect(json).toContain('"seniority":null'); // sem senioridade definida continua aparecendo
  });

  it("sem perfil ou com compat desligado, não filtra por perfil", () => {
    expect(JSON.stringify(buildJobsWhere(parseFilters({}), "u1", null))).not.toContain("seniority");
    expect(JSON.stringify(buildJobsWhere(parseFilters({ compat: "0" }), "u1", profile))).not.toContain("seniority");
  });

  it("aplica busca, fonte, modalidade, senioridade e status", () => {
    const json = JSON.stringify(
      buildJobsWhere(parseFilters({ q: "react", source: "gupy", mode: "REMOTE", level: "MID", status: "CLOSED", compat: "0" }), "u1", null),
    );
    expect(json).toContain('"company":{"contains":"react"');
    expect(json).toContain('"source":{"slug":"gupy"}');
    expect(json).toContain('"workMode":"REMOTE"');
    expect(json).toContain('"seniority":"MID"');
    expect(json).toContain('"status":"CLOSED"');
  });
});

describe("filtersToQuery", () => {
  it("omite padrões e reflete o resto na URL", () => {
    expect(filtersToQuery(parseFilters({}))).toBe("");
    expect(filtersToQuery(parseFilters({ q: "react", compat: "0", page: "3" }))).toBe("?q=react&compat=0&page=3");
    expect(filtersToQuery(parseFilters({ q: "a b" }), { page: 2 })).toBe("?q=a+b&page=2");
  });
});

describe("helpers", () => {
  it("daysAgoLabel", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    expect(daysAgoLabel(new Date("2026-11-10T01:00:00Z"), now)).toBe("hoje");
    expect(daysAgoLabel(new Date("2026-11-09T01:00:00Z"), now)).toBe("ontem");
    expect(daysAgoLabel(new Date("2026-11-03T12:00:00Z"), now)).toBe("há 7 dias");
  });

  it("isHttpUrl só aceita http(s)", () => {
    expect(isHttpUrl("https://a.com")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("x")).toBe(false);
  });
});

describe("buildQueryFromProfile", () => {
  it("junta cargos e principais skills, sem repetir (ignorando caixa)", () => {
    const q = buildQueryFromProfile({
      targetRoles: ["Desenvolvedor Front-end", "front-end developer", "Desenvolvedor front-end"],
      skills: ["React", "TypeScript", "react", "Next.js", "CSS"],
      country: "BR",
      workModes: ["REMOTE"],
    });
    expect(q.keywords).toEqual(["Desenvolvedor Front-end", "front-end developer", "React", "TypeScript"]);
    expect(q).toMatchObject({ country: "BR", workModes: ["REMOTE"], maxResults: 200 });
  });
});
