import { describe, expect, it } from "vitest";
import { contentHash } from "@/server/jobs/content-hash";
import { decodeEntities, htmlToText, normalizeForComparison } from "@/server/jobs/text";

describe("htmlToText", () => {
  it("remove tags e preserva parágrafos e listas", () => {
    const html = "<p>Somos a <b>Empresa</b>.</p><p>Requisitos:</p><ul><li>React</li><li>TypeScript</li></ul>";
    expect(htmlToText(html)).toBe("Somos a Empresa.\n\nRequisitos:\n\n- React\n- TypeScript");
  });

  it("converte <br> em quebra de linha", () => {
    expect(htmlToText("linha 1<br>linha 2<br/>linha 3")).toBe("linha 1\nlinha 2\nlinha 3");
  });

  it("remove script e style com o conteúdo", () => {
    const out = htmlToText('<p>ok</p><script>alert("x")</script><style>p{color:red}</style><iframe src="x"></iframe>');
    expect(out).toBe("ok");
  });

  it("decodifica entidades, inclusive tags escapadas (dupla codificação)", () => {
    expect(htmlToText("&lt;p&gt;Desenvolvedor &amp; analista &ndash; S&atilde;o Paulo&lt;/p&gt;")).toBe("Desenvolvedor & analista – São Paulo");
    expect(htmlToText("&#233;&#x20AC; &nbsp;fim")).toBe("é€ fim");
  });

  it("não deixa tag ativa sobreviver", () => {
    const out = htmlToText('&lt;script&gt;alert(1)&lt;/script&gt;<img src=x onerror="alert(1)">texto<a href="javascript:x">link</a>');
    expect(out).not.toMatch(/<[a-z/]/i);
    expect(out).toContain("texto");
    expect(out).toContain("link");
  });

  it("não confunde '<10' com uma tag", () => {
    expect(htmlToText("<p>equipes de <10 pessoas e salário >5k</p>")).toBe("equipes de <10 pessoas e salário >5k");
  });

  it("atributos com '>' não vazam para o texto", () => {
    expect(htmlToText('<a title="a > b" href="x">texto</a>')).toBe("texto");
  });

  it("ignora entidade numérica inválida sem quebrar", () => {
    expect(decodeEntities("a&#99999999;b&#0;c")).toBe("abc");
  });

  it("respeita o limite de tamanho e entradas vazias", () => {
    expect(htmlToText("x".repeat(100), 10)).toHaveLength(10);
    expect(htmlToText(undefined)).toBe("");
    expect(htmlToText("")).toBe("");
  });
});

describe("contentHash", () => {
  const base = { company: "Empresa Ltda", title: "Desenvolvedor Front-end", description: "<p>Vaga para <b>React</b>.</p>" };

  it("é um SHA-256 em hexadecimal", () => {
    expect(contentHash(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ignora caixa, acentos, HTML e espaços", () => {
    const other = { company: "EMPRESA  LTDA", title: "desenvolvedor   front-end", description: "Vaga para React." };
    expect(contentHash(other)).toBe(contentHash(base));
    expect(contentHash({ ...base, title: "Desenvolvedor Frónt-énd" })).toBe(contentHash({ ...base, title: "desenvolvedor front-end" }));
  });

  it("muda quando o conteúdo muda", () => {
    expect(contentHash({ ...base, description: "Vaga para Vue." })).not.toBe(contentHash(base));
    expect(contentHash({ ...base, company: "Outra" })).not.toBe(contentHash(base));
  });

  it("não mistura campos (empresa+título ≠ título+empresa)", () => {
    expect(contentHash({ company: "A", title: "B", description: "" })).not.toBe(contentHash({ company: "B", title: "A", description: "" }));
  });
});

describe("normalizeForComparison", () => {
  it("minúsculas, sem acentos e espaços colapsados", () => {
    expect(normalizeForComparison("  <b>Atuação</b>   Média  ")).toBe("atuacao media");
  });
});
