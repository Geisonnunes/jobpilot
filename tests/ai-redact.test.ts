import { describe, expect, it } from "vitest";
import { redactPii } from "@/server/ai/match/redact";
import { RESUME_TEXT } from "./ai-helpers";

describe("redactPii", () => {
  it("remove e-mails, telefones, links e o nome", () => {
    const { text, counts } = redactPii(RESUME_TEXT, { names: ["Maria Souza", "Maria"] });
    expect(text).not.toContain("maria@example.com");
    expect(text).not.toContain("91234");
    expect(text).not.toContain("linkedin.com");
    expect(text).not.toMatch(/Maria|Souza/);
    expect(counts).toMatchObject({ emails: 1, phones: 1, links: 1 });
  });
  it("mantém o conteúdo profissional e intervalos de anos", () => {
    const { text } = redactPii(RESUME_TEXT);
    expect(text).toContain("projetos em React e TypeScript");
    expect(text).toContain("2021-2023");
  });
  it("remove CPF, CEP e linhas de endereço", () => {
    const { text, counts } = redactPii("CPF 123.456.789-09\nRua das Flores, 100 - Centro\nCEP 01310-100\nSkills: React");
    expect(text).not.toMatch(/123\.456|Flores|01310/);
    expect(text).toContain("Skills: React");
    expect(counts.cpfs).toBe(1);
    expect(counts.addresses).toBe(2);
  });
  it("remove telefones em formatos variados", () => {
    for (const phone of ["(11) 91234-5678", "+55 11 91234-5678", "11912345678", "91234-5678", "(21) 3456-7890"]) {
      expect(redactPii(`Tel: ${phone}`).text, phone).not.toMatch(/\d{4}/);
    }
  });
  it("remove links com e sem esquema", () => {
    const { text } = redactPii("github.com/maria e https://maria.dev/portfolio e www.site.com.br e a@b.co");
    expect(text).not.toMatch(/github\.com|maria\.dev|site\.com|a@b/);
  });
  it("ignora nomes curtos demais", () => {
    expect(redactPii("Al trabalha com React", { names: ["Al"] }).text).toContain("Al trabalha");
  });
});
