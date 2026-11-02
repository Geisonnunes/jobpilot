/**
 * Estados brasileiros: converte "São Paulo", "sao paulo" ou "SP" na sigla (UF).
 * A Gupy devolve o estado por extenso; o perfil guarda a sigla.
 */

export const STATE_NAME_TO_UF: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE", "distrito federal": "DF",
  "espirito santo": "ES", goias: "GO", maranhao: "MA", "mato grosso": "MT", "mato grosso do sul": "MS",
  "minas gerais": "MG", para: "PA", paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI",
  "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR",
  "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
};

const UF_SET = new Set(Object.values(STATE_NAME_TO_UF));

const fold = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Sigla da UF ("SP") ou null quando o texto não é um estado reconhecido. */
export function toUf(value: string | null | undefined): string | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  if (UF_SET.has(upper)) return upper;
  return STATE_NAME_TO_UF[fold(value)] ?? null;
}
