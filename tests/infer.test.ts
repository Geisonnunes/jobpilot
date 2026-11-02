import { describe, expect, it } from "vitest";
import { inferSeniority, inferWorkMode } from "@/server/jobs/infer";

describe("inferSeniority", () => {
  it.each([
    ["Estágio em Desenvolvimento Front-end", "INTERN"],
    ["Front-end Intern", "INTERN"],
    ["Desenvolvedor Front-end Júnior", "JUNIOR"],
    ["Desenvolvedor Frontend Jr", "JUNIOR"],
    ["Junior React Developer", "JUNIOR"],
    ["Desenvolvedor Front-end Pleno", "MID"],
    ["Mid-level Frontend Engineer", "MID"],
    ["Desenvolvedora Sênior de Front-end", "SENIOR"],
    ["Senior Software Engineer", "SENIOR"],
    ["Tech Lead Front-end", "LEAD"],
    ["Líder Técnico", "LEAD"],
  ])("%s → %s", (title, expected) => {
    expect(inferSeniority(title)).toBe(expected);
  });

  it("em 'Júnior/Pleno' vale o menor nível", () => {
    expect(inferSeniority("Desenvolvedor Júnior/Pleno")).toBe("JUNIOR");
  });

  it("não inventa: título neutro sem pista na descrição → undefined", () => {
    expect(inferSeniority("Desenvolvedor Front-end", "Trabalhe com React. Valorizamos experiência com sêniores.")).toBeUndefined();
  });

  it("não confunde PL/SQL com pleno", () => {
    expect(inferSeniority("Analista PL/SQL")).toBeUndefined();
  });

  it("usa a descrição só com rótulo explícito", () => {
    expect(inferSeniority("Desenvolvedor Front-end", "Nível: Júnior\nLocal: SP")).toBe("JUNIOR");
    expect(inferSeniority("Desenvolvedor Web", "Vaga de estágio com bolsa")).toBe("INTERN");
  });
});

describe("inferWorkMode", () => {
  it.each([
    ["Desenvolvedor Front-end (100% remoto)", "", "", "REMOTE"],
    ["Front-end Developer", "", "Remote - Brazil", "REMOTE"],
    ["Front-end", "Trabalho em home office", "", "REMOTE"],
    ["Desenvolvedor Front-end Híbrido", "", "", "HYBRID"],
    ["Front-end", "Modelo híbrido: 3 dias remoto, 2 presencial", "", "HYBRID"],
    ["Front-end", "Atuação presencial em São Paulo", "", "ONSITE"],
    ["Front-end on-site", "", "", "ONSITE"],
  ])("%s | %s | %s → %s", (title, description, location, expected) => {
    expect(inferWorkMode(title, description, location)).toBe(expected);
  });

  it("título e local têm prioridade sobre a descrição", () => {
    expect(inferWorkMode("Front-end Presencial", "Aceitamos candidatos remotos")).toBe("ONSITE");
  });

  it("sem pista → undefined", () => {
    expect(inferWorkMode("Desenvolvedor Front-end", "Venha crescer conosco.")).toBeUndefined();
  });
});
