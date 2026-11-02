import { describe, expect, it } from "vitest";
import { STATE_NAME_TO_UF, toUf } from "@/lib/states";
import { UFS } from "@/lib/profile";

describe("toUf", () => {
  it("converte nome por extenso, com e sem acento, e sigla", () => {
    expect(toUf("São Paulo")).toBe("SP");
    expect(toUf("sao paulo")).toBe("SP");
    expect(toUf("Distrito Federal")).toBe("DF");
    expect(toUf("Rio Grande do Sul")).toBe("RS");
    expect(toUf("pr")).toBe("PR");
    expect(toUf("  Paraná ")).toBe("PR");
  });
  it("devolve null para vazio ou desconhecido", () => {
    expect(toUf("")).toBeNull();
    expect(toUf(null)).toBeNull();
    expect(toUf(undefined)).toBeNull();
    expect(toUf("Atlântida")).toBeNull();
  });
  it("cobre exatamente as 27 UFs do perfil", () => {
    expect(new Set(Object.values(STATE_NAME_TO_UF))).toEqual(new Set(UFS));
  });
});
