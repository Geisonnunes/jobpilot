import { describe, expect, it } from "vitest";
import { canonicalUrl } from "@/server/jobs/canonical-url";

describe("canonicalUrl", () => {
  it("remove parâmetros de rastreamento, fragmento e barra final", () => {
    expect(canonicalUrl("https://Empresa.gupy.io/jobs/123/?utm_source=x&utm_medium=y&ref=abc&source=li&gclid=1#apply")).toBe(
      "https://empresa.gupy.io/jobs/123",
    );
  });

  it("mantém parâmetros funcionais e ordena para não depender da ordem", () => {
    const a = canonicalUrl("https://site.com/vaga?id=7&lang=pt");
    const b = canonicalUrl("https://site.com/vaga?lang=pt&id=7&utm_campaign=z");
    expect(a).toBe(b);
    expect(a).toContain("id=7");
  });

  it("trata http, www, porta e credenciais como a mesma URL", () => {
    expect(canonicalUrl("http://www.site.com:443/vaga/")).toBe("https://site.com/vaga");
    expect(canonicalUrl("https://user:pass@site.com/vaga")).toBe("https://site.com/vaga");
  });

  it("reconhece a mesma vaga do LinkedIn com rastreamento diferente", () => {
    const a = canonicalUrl("https://br.linkedin.com/jobs/view/3912345678/?trackingId=AAA&refId=BBB&trk=public_jobs");
    const b = canonicalUrl("https://www.linkedin.com/jobs/view/3912345678?refId=CCC&lipi=urn%3Ali&midToken=Z");
    expect(a).toBe("https://www.linkedin.com/jobs/view/3912345678");
    expect(a).toBe(b);
  });

  it("mantém o currentJobId do LinkedIn, que identifica a vaga", () => {
    expect(canonicalUrl("https://www.linkedin.com/jobs/collections/recommended/?currentJobId=42&trk=x")).toBe(
      "https://www.linkedin.com/jobs/collections/recommended?currentJobId=42",
    );
  });

  it("raiz sem barra", () => {
    expect(canonicalUrl("https://site.com/")).toBe("https://site.com");
  });

  it("devolve null para o que não é URL http(s)", () => {
    expect(canonicalUrl("")).toBeNull();
    expect(canonicalUrl("não é url")).toBeNull();
    expect(canonicalUrl("javascript:alert(1)")).toBeNull();
    expect(canonicalUrl("ftp://site.com/x")).toBeNull();
    expect(canonicalUrl(`https://site.com/${"a".repeat(3000)}`)).toBeNull();
  });
});
