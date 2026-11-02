import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeGupyJob } from "@/server/connectors/gupy";
import { inferSeniority } from "@/server/jobs/infer";
import { classifyRelevance, detectTitleLevel, filterByRelevance, isRelevant, type RelevanceCategory } from "@/server/jobs/relevance";

const junior = { seniority: "JUNIOR" as const };
const cat = (title: string, description = "", profile = junior): RelevanceCategory => classifyRelevance({ title, description }, profile).category;

describe("classifyRelevance: relevantes e full-stack", () => {
  it.each([
    "Desenvolvedor Front-end Júnior",
    "Desenvolvedor Front- End",
    "Desenvolvedora Frontend",
    "Front End Developer",
    "Pessoa Desenvolvedora Júnior VTEX (FRONT-END)",
    "Desenvolvedor React",
    "Desenvolvedor Next.js Jr",
    "Dev Web Júnior",
    "Desenvolvedor de Interfaces",
    "Analista de Desenvolvimento Angular",
    "Desenvolvedor TypeScript",
    "Desenvolvedor Vue.js",
  ])("mantém %s como RELEVANT", (title) => {
    expect(cat(title)).toBe("RELEVANT");
  });

  it("full-stack com front-end no título ou no começo da descrição é mantido", () => {
    expect(cat("Desenvolvedor Full Stack | Node.js | React")).toBe("FULLSTACK");
    expect(cat("Desenvolvedor Fullstack Júnior", "Atuação com React e APIs REST")).toBe("FULLSTACK");
  });

  it("full-stack SEM front-end relevante é descartado", () => {
    const r = classifyRelevance({ title: "Desenvolvedor Fullstack Java e Spring", description: "Serviços em Java, Kafka e Oracle." }, junior);
    expect(r).toMatchObject({ category: "IRRELEVANT", keep: false });
  });

  it("título genérico só passa se a descrição mostrar front-end", () => {
    expect(cat("Desenvolvedor de Software", "Construímos telas com React e TypeScript.")).toBe("RELEVANT");
    expect(cat("Desenvolvedor de Software", "Trabalhamos com Java e PostgreSQL.")).toBe("IRRELEVANT");
    expect(cat("Engenheiro de Software")).toBe("IRRELEVANT");
  });
});

describe("classifyRelevance: irrelevantes", () => {
  it.each([
    ["Vendedor Interno", "outra área"],
    ["Assistente Administrativo", "outra área"],
    ["Analista de Dados", "dados"],
    ["Engenheiro de Dados", "dados"],
    ["Desenvolvedor Android", "mobile"],
    ["Desenvolvedor React Native", "mobile"],
    ["Desenvolvedor React-native", "mobile"],
    ["Engenheiro DevOps", "infra"],
    ["Analista de QA", "QA"],
    ["Analista de Testes", "QA"],
    ["Desenvolvedor Java", "back-end"],
    ["Desenvolvedor Backend Node.js", "back-end"],
    ["Software Engineer Backend (.Net/React)", "back-end"],
    ["Designer UX", "outra área"],
  ])("descarta %s", (title) => {
    const r = classifyRelevance({ title, description: "Descrição sem relação com web." }, junior);
    expect(r.keep).toBe(false);
    expect(r.category).toBe("IRRELEVANT");
  });

  it("não confunde 'react native' com 'react' (web)", () => {
    expect(cat("Desenvolvedor React Native")).toBe("IRRELEVANT");
    expect(cat("Desenvolvedor Front-end React Native e Web")).toBe("RELEVANT");
  });
});

describe("classifyRelevance: falsos positivos comuns", () => {
  it("'Analista de Suporte React' tem tecnologia do perfil: mantém, apesar de 'suporte'", () => {
    expect(isRelevant({ title: "Analista de Suporte React" }, junior)).toBe(true);
  });
  it("'Desenvolvedor Front-end Pleno/Júnior' aceita júnior: não é descartada por 'Pleno'", () => {
    expect(cat("Desenvolvedor Front-end Pleno/Júnior")).toBe("RELEVANT");
    expect(cat("Desenvolvedor Front-end Júnior/Pleno")).toBe("RELEVANT");
  });
  it("'Sr.' no nome da empresa não vira senioridade", () => {
    expect(cat("Desenvolvedor Front-end - Sr. Pão Alimentos")).toBe("RELEVANT");
    expect(cat("Desenvolvedor React na Sr. Pão")).toBe("RELEVANT");
    expect(cat("Desenvolvedor React - Senior Sistemas")).toBe("RELEVANT");
  });
  it("'Sr' colado ao cargo é sênior", () => {
    expect(cat("DESENVOLVEDOR FRONT END SR")).toBe("SENIORITY_ABOVE");
    expect(cat("Sr Developer Analyst React")).toBe("SENIORITY_ABOVE");
    expect(cat("Front-end Developer Sr.")).toBe("SENIORITY_ABOVE");
  });
  it("'Pl' colado ao cargo é pleno", () => {
    expect(cat("Desenvolvedor Front-end Pl")).toBe("SENIORITY_ABOVE");
    expect(cat("Desenvolvedor Front end Angular Pl/Sr")).toBe("SENIORITY_ABOVE");
  });
  it("'Júnior' e 'estágio' nunca são descartados por nível", () => {
    for (const t of ["Desenvolvedor Front-end Júnior", "Estágio em Desenvolvimento Front-end", "Dev React Jr", "Front-end Trainee"]) {
      expect(isRelevant({ title: t }, junior), t).toBe(true);
    }
  });
});

describe("classifyRelevance: senioridade acima", () => {
  it.each([
    "Desenvolvedor Front-end Pleno",
    "Desenvolvedor Front-end Sênior",
    "Desenvolvedor Front-end Especialista",
    "Staff Front-end Engineer",
    "Tech Lead React",
    "Coordenador de Front-end",
    "Gerente de Engenharia Front-end",
    "Front-end Developer Mid",
    "Desenvolvedor React III",
    "Pessoa Desenvolvedora Fullstack II (React / NodeJS)",
    "Software Architect Fullstack React",
  ])("descarta %s para perfil júnior", (title) => {
    expect(classifyRelevance({ title }, junior)).toMatchObject({ category: "SENIORITY_ABOVE", keep: false });
  });

  it("para perfil pleno, mantém pleno e descarta sênior; estágio aceita júnior", () => {
    expect(isRelevant({ title: "Desenvolvedor Front-end Pleno" }, { seniority: "MID" })).toBe(true);
    expect(isRelevant({ title: "Desenvolvedor Front-end Sênior" }, { seniority: "MID" })).toBe(false);
    expect(isRelevant({ title: "Desenvolvedor Front-end Júnior" }, { seniority: "INTERN" })).toBe(true);
    expect(isRelevant({ title: "Desenvolvedor Front-end Pleno" }, { seniority: "INTERN" })).toBe(false);
  });

  it("uma vaga fora da área é contada como irrelevante, não como nível", () => {
    expect(cat("Gerente de Vendas")).toBe("IRRELEVANT");
  });
});

describe("detectTitleLevel e inferSeniority", () => {
  it("detecta nível por Pl/Sr/II/III/Architect (que as regras antigas perdiam)", () => {
    expect(detectTitleLevel("Desenvolvedor FullStack Java/React Pl (Remoto)")).toBe("MID");
    expect(detectTitleLevel("Pessoa Desenvolvedora Fullstack Node/React III")).toBe("SENIOR");
    expect(detectTitleLevel("Software Architect Fullstack")).toBe("SENIOR");
    expect(detectTitleLevel("Desenvolvedor Front-end")).toBeUndefined();
  });
  it("inferSeniority usa o detector como reforço, sem mudar o que já funcionava", () => {
    expect(inferSeniority("Desenvolvedor FullStack Java/React Pl")).toBe("MID");
    expect(inferSeniority("Desenvolvedor Júnior")).toBe("JUNIOR");
    expect(inferSeniority("Desenvolvedor Sênior")).toBe("SENIOR");
  });
});

describe("filterByRelevance e as fixtures reais da Gupy", () => {
  const fixture = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "gupy-search.json"), "utf8")) as { data: unknown[] };
  const jobs = fixture.data.flatMap((r) => {
    const j = normalizeGupyJob(r);
    return j ? [{ ...j, sourceKeyword: "React" }] : [];
  });

  it("separa mantidas e descartadas, e os contadores fecham", () => {
    const { kept, stats } = filterByRelevance(jobs, junior);
    expect(stats.fetched).toBe(jobs.length);
    expect(stats.kept).toBe(kept.length);
    expect(stats.kept + stats.discardedIrrelevant + stats.discardedSeniority).toBe(stats.fetched);
    expect(stats.relevant + stats.fullstack).toBe(stats.kept);
    expect(stats.byKeyword.React).toEqual({ fetched: jobs.length, kept: kept.length });
  });

  it("todas as vagas mantidas passam na classificação individual", () => {
    const { kept } = filterByRelevance(jobs, junior);
    for (const job of kept) expect(classifyRelevance(job, junior).keep).toBe(true);
  });

  it("sem rede: a fixture é só leitura de arquivo (cada vaga tem título e URL da Gupy)", () => {
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.every((j) => j.url.includes("gupy.io") && j.title.length > 0)).toBe(true);
  });
});
