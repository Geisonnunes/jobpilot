import { z } from "zod";

/** Constantes e schemas de currículo, sem dependências de servidor. */

export const RESUME_MIN_CHARS = 300;
export const RESUME_MAX_CHARS = 30_000;
export const PDF_MAX_BYTES = 5 * 1024 * 1024;
export const LABEL_MAX_CHARS = 80;

/** Normaliza quebras de linha e remove caracteres nulos (preserva parágrafos). */
export function cleanResumeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Forma usada só para o hash: trim + espaços e quebras de linha colapsados. */
export function normalizeForHash(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export const saveResumeSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Informe um nome para o currículo.")
    .max(LABEL_MAX_CHARS, `Use no máximo ${LABEL_MAX_CHARS} caracteres no nome.`),
  rawText: z
    .string()
    .transform(cleanResumeText)
    .pipe(
      z
        .string()
        .min(RESUME_MIN_CHARS, `O texto precisa ter pelo menos ${RESUME_MIN_CHARS} caracteres.`)
        .max(RESUME_MAX_CHARS, `O texto pode ter no máximo ${RESUME_MAX_CHARS.toLocaleString("pt-BR")} caracteres.`),
    ),
});

export const resumeIdSchema = z.string().min(1).max(64);

export type ResumeFormState = {
  status: "idle" | "success" | "error" | "duplicate";
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

export type PdfExtractResult =
  | { ok: true; text: string; pages: number }
  | { ok: false; message: string };

export type ResumeActionResult = { ok: boolean; message?: string };
