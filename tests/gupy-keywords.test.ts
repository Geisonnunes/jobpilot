import { describe, expect, it } from "vitest";
import { buildGupyKeywords, buildGupyQuery, buildQueryFromProfile, GUPY_MAX_KEYWORDS, keywordKey, roleCore } from "@/server/jobs/query";
import { buildGupyUrl } from "@/server/connectors/gupy";

const profile = {
  targetRoles: ["Desenvolvedor Front-end", "Front-end Developer"],
  skills: ["React", "TypeScript", "JavaScript", "Next.js", "Tailwind"],
  country: "BR",
  workModes: ["REMOTE", "HYBRID"] as ("REMOTE" | "HYBRID")[],
  seniority: "JUNIOR" as const,
};

describe("buildGupyKeywords", () => {
  it("do mais específico ao mais amplo, com 'júnior' e no máximo 6 termos", () => {
    const k = buildGupyKeywords(profile);
    expect(k).toEqual(["Front-end júnior", "Desenvolvedor Front-end", "Front-end Developer", "React júnior", "Front-end", "React"]);
    expect(k.length).toBeLessThanOrEqual(GUPY_MAX_KEYWORDS);
  });

  it("habilidades genéricas (JavaScript, TypeScript…) não entram sozinhas", () => {
    const k = buildGupyKeywords({ ...profile, skills: ["JavaScript", "TypeScript", "HTML", "CSS", "Git"] });
    expect(k.map(keywordKey)).not.toContain("javascript");
    expect(k.map(keywordKey)).not.toContain("typescript");
    expect(k.every((t) => !/javascript|typescript|html|css|git/i.test(t))).toBe(true);
  });

  it("normaliza e deduplica (acento, caixa, hífen)", () => {
    const k = buildGupyKeywords({ ...profile, targetRoles: ["Front-end", "FRONTEND", "front end", "Frontend"], skills: ["react", "React"] });
    const keys = k.map(keywordKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keywordKey("Front-end")).toBe(keywordKey("frontend"));
    expect(keywordKey("Júnior React")).toBe("juniorreact");
  });

  it("o termo de nível acompanha a senioridade do perfil", () => {
    expect(buildGupyKeywords({ ...profile, seniority: "INTERN" })[0]).toBe("Front-end estágio");
    expect(buildGupyKeywords({ ...profile, seniority: "MID" })[0]).toBe("Front-end pleno");
    expect(buildGupyKeywords({ ...profile, seniority: "LEAD" })[0]).toBe("Desenvolvedor Front-end"); // sem termo de nível
  });

  it("perfil sem cargos ou sem habilidades ainda gera termos; vazio gera lista vazia", () => {
    expect(buildGupyKeywords({ ...profile, targetRoles: [] })).toEqual(["React júnior", "React", "Next.js júnior", "Next.js"]);
    expect(buildGupyKeywords({ ...profile, skills: [] }).length).toBeGreaterThan(0);
    expect(buildGupyKeywords({ targetRoles: [], skills: [], seniority: "JUNIOR" })).toEqual([]);
  });

  it("roleCore tira prefixos e sufixos genéricos", () => {
    expect(roleCore("Desenvolvedor Front-end")).toBe("Front-end");
    expect(roleCore("Pessoa Desenvolvedora de Interfaces")).toBe("Interfaces");
    expect(roleCore("Front-end Developer")).toBe("Front-end");
  });
});

describe("buildGupyQuery e a URL da API", () => {
  it("usa modalidades do perfil no parâmetro workplaceType (já comprovado no Career Ops)", () => {
    const q = buildGupyQuery(profile);
    expect(q.workModes).toEqual(["REMOTE", "HYBRID"]);
    const url = new URL(buildGupyUrl(q.keywords[0], 0, q.workModes));
    expect(Object.fromEntries(url.searchParams)).toEqual({ jobName: "Front-end júnior", offset: "0", limit: "100", workplaceType: "remote,hybrid" });
  });
  it("só envia parâmetros comprovados (jobName, offset, limit, workplaceType)", () => {
    const params = [...new URL(buildGupyUrl("x", 1, ["ONSITE"])).searchParams.keys()];
    expect(params.sort()).toEqual(["jobName", "limit", "offset", "workplaceType"]);
  });
  it("a busca do Remotive não muda", () => {
    expect(buildQueryFromProfile(profile).keywords).toEqual(["Desenvolvedor Front-end", "Front-end Developer", "React", "TypeScript", "JavaScript"]);
  });
});
