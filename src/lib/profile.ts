import { z } from "zod";

/**
 * Constantes, schema e conversões do perfil do candidato.
 * Sem dependências de servidor: usado tanto pela Server Action quanto pelo formulário.
 */

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export const SENIORITIES = [
  { value: "INTERN", label: "Estágio" },
  { value: "JUNIOR", label: "Júnior" },
  { value: "MID", label: "Pleno" },
  { value: "SENIOR", label: "Sênior" },
  { value: "LEAD", label: "Lead" },
] as const;

export const WORK_MODES = [
  { value: "REMOTE", label: "Remoto" },
  { value: "HYBRID", label: "Híbrido" },
  { value: "ONSITE", label: "Presencial" },
] as const;

export const LANGUAGE_LEVELS = [
  { value: "basic", label: "Básico" },
  { value: "intermediate", label: "Intermediário" },
  { value: "advanced", label: "Avançado" },
  { value: "fluent", label: "Fluente" },
] as const;

export const MAX_TAGS = 30;
export const MAX_LANGUAGES = 10;

export type LanguageEntry = { lang: string; level: (typeof LANGUAGE_LEVELS)[number]["value"] };

/** Valores do formulário (tudo string/array, como o usuário vê). */
export type ProfileFormValues = {
  headline: string;
  city: string;
  state: string;
  country: string;
  seniority: string;
  targetRoles: string[];
  skills: string[];
  workModes: string[];
  salaryMin: string; // "3.500,00"
  minMatchScore: string; // "4.0"
  excludeKeywords: string[];
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  languages: LanguageEntry[];
};

export const SUGGESTED_VALUES: ProfileFormValues = {
  headline: "",
  city: "",
  state: "",
  country: "BR",
  seniority: "JUNIOR",
  targetRoles: ["Desenvolvedor Front-end", "Front-end Developer"],
  skills: ["React", "TypeScript", "JavaScript", "Next.js"],
  workModes: ["REMOTE", "HYBRID"],
  salaryMin: "",
  minMatchScore: "4.0",
  excludeKeywords: ["Sênior", "Senior", "Pleno"],
  linkedinUrl: "",
  githubUrl: "",
  portfolioUrl: "",
  languages: [],
};

/** Centavos → "3.500,00". */
export function centsToReais(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "3.500,00" | "3500,5" | "3500" → centavos, ou null se inválido. */
export function reaisToCents(input: string): number | null {
  const s = input.trim().replace(/^R\$\s*/, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(s)) return null;
  const [int, frac = ""] = s.replace(/\./g, "").split(",");
  return Number(int) * 100 + Number(frac.padEnd(2, "0"));
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .transform((v) => (v === "" ? null : v));

const optionalUrl = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .refine(
    (v) => {
      if (v === null) return true;
      try {
        const u = new URL(v);
        return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".");
      } catch {
        return false;
      }
    },
    "Informe uma URL válida, começando com https://",
  );

/** Lista de tags: aparada, sem vazios, sem duplicatas (case-insensitive), até MAX_TAGS. */
function tagList(label: string) {
  return z
    .array(z.string())
    .transform((items) => {
      const seen = new Set<string>();
      return items
        .map((i) => i.trim())
        .filter((i) => {
          const k = i.toLowerCase();
          if (!i || seen.has(k)) return false;
          seen.add(k);
          return true;
        });
    })
    .pipe(
      z
        .array(z.string().max(60, `Cada item de ${label} deve ter até 60 caracteres.`))
        .max(MAX_TAGS, `Use no máximo ${MAX_TAGS} itens em ${label}.`),
    );
}

export const profileSchema = z.object({
  headline: optionalText(120),
  city: optionalText(80),
  state: z
    .string()
    .trim()
    .refine((v) => v === "" || (UFS as readonly string[]).includes(v), "Selecione uma UF válida.")
    .transform((v) => (v === "" ? null : v)),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Use o código do país com 2 letras, como BR."),
  seniority: z.enum(["INTERN", "JUNIOR", "MID", "SENIOR", "LEAD"], {
    error: "Selecione a senioridade.",
  }),
  targetRoles: tagList("cargos desejados"),
  skills: tagList("tecnologias"),
  workModes: z
    .array(z.enum(["REMOTE", "HYBRID", "ONSITE"]))
    .min(1, "Marque pelo menos uma modalidade de trabalho."),
  salaryMin: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      const cents = reaisToCents(v);
      if (cents === null) {
        ctx.addIssue({ code: "custom", message: "Informe um valor em reais, como 3.500,00." });
        return z.NEVER;
      }
      if (cents > 100_000_000) {
        ctx.addIssue({ code: "custom", message: "O valor é alto demais." });
        return z.NEVER;
      }
      return cents;
    }),
  minMatchScore: z
    .string()
    .trim()
    .transform((v) => Number(v.replace(",", ".")))
    .pipe(
      z
        .number({ error: "Informe um número entre 1,0 e 5,0." })
        .min(1, "O mínimo é 1,0.")
        .max(5, "O máximo é 5,0.")
        .refine((n) => Number.isInteger(n * 2), "Use passos de 0,5 (ex.: 3,5 ou 4,0)."),
    ),
  excludeKeywords: tagList("palavras de exclusão"),
  linkedinUrl: optionalUrl,
  githubUrl: optionalUrl,
  portfolioUrl: optionalUrl,
  languages: z
    .array(
      z.object({
        lang: z.string().trim().min(1, "Informe o idioma.").max(40, "Use até 40 caracteres no idioma."),
        level: z.enum(["basic", "intermediate", "advanced", "fluent"], { error: "Selecione o nível." }),
      }),
    )
    .max(MAX_LANGUAGES, `Use no máximo ${MAX_LANGUAGES} idiomas.`),
});

export type ProfileData = z.output<typeof profileSchema>;

export type ProfileFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  errors?: Record<string, string[] | undefined>;
};
