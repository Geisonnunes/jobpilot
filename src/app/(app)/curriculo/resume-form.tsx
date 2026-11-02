"use client";

import { startTransition, useActionState, useRef, useState, useTransition } from "react";
import {
  LABEL_MAX_CHARS,
  PDF_MAX_BYTES,
  RESUME_MAX_CHARS,
  RESUME_MIN_CHARS,
  type ResumeFormState,
} from "@/lib/resume";
import { extractPdfText, saveResume } from "./actions";

const initialState: ResumeFormState = { status: "idle" };

const fieldClass =
  "mt-1.5 block w-full min-w-0 rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-600/40";

type Props = {
  initialLabel: string;
  initialText: string;
  fromVersion: { label: string; version: number } | null;
  existingLabels: { label: string; nextVersion: number }[];
};

/**
 * Todos os campos são controlados e o envio usa onSubmit + startTransition
 * (sem <form action>), para o React não resetar o formulário após um erro.
 */
export function ResumeForm({ initialLabel, initialText, fromVersion, existingLabels }: Props) {
  const [state, formAction, saving] = useActionState(saveResume, initialState);
  const [label, setLabel] = useState(initialLabel);
  const [text, setText] = useState(initialText);
  const [pdfMessage, setPdfMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [extracting, startExtract] = useTransition();
  const [handled, setHandled] = useState<ResumeFormState>(state);
  const fileRef = useRef<HTMLInputElement>(null);

  // Após salvar com sucesso, limpa o formulário (ajuste de estado durante a renderização).
  if (state !== handled) {
    setHandled(state);
    if (state.status === "success") {
      setLabel("");
      setText("");
      setPdfMessage(null);
    }
  }

  const errors = state.errors ?? {};
  const chars = text.trim().length;
  const tooShort = chars > 0 && chars < RESUME_MIN_CHARS;
  const tooLong = chars > RESUME_MAX_CHARS;
  const match = existingLabels.find((l) => l.label.toLowerCase() === label.trim().toLowerCase());

  function onPickFile(file: File | undefined) {
    if (!file) return;
    // Pré-checagem só para dar retorno rápido; o servidor valida tudo de novo.
    if (file.size > PDF_MAX_BYTES) {
      setPdfMessage({ kind: "error", text: "O PDF excede o limite de 5 MB." });
      return;
    }
    const data = new FormData();
    data.set("file", file);
    setPdfMessage(null);
    startExtract(async () => {
      const result = await extractPdfText(data);
      if (result.ok) {
        setText(result.text);
        setPdfMessage({
          kind: "ok",
          text: `Texto extraído de ${result.pages} página(s). Revise abaixo e corrija o que for preciso antes de salvar.`,
        });
      } else {
        setPdfMessage({ kind: "error", text: result.message });
      }
    });
    if (fileRef.current) fileRef.current.value = ""; // permite escolher o mesmo arquivo de novo
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="mt-3 space-y-5"
      noValidate
    >
      {fromVersion && (
        <p className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          Editando a partir de “{fromVersion.label}” (versão {fromVersion.version}). Ao salvar, será criada uma nova
          versão; a anterior continua disponível.
        </p>
      )}

      <div>
        <label htmlFor="label" className="block text-sm font-medium">Nome do currículo</label>
        <input
          id="label"
          name="label"
          value={label}
          maxLength={LABEL_MAX_CHARS + 20}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="CV base – Front-end"
          aria-invalid={Boolean(errors.label)}
          aria-describedby={errors.label ? "label-error" : "label-hint"}
          className={`${fieldClass} ${errors.label ? "border-red-500" : "border-zinc-300 dark:border-zinc-700"}`}
        />
        {errors.label ? (
          <p id="label-error" role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.label[0]}</p>
        ) : (
          <p id="label-hint" className="mt-1 text-xs text-zinc-500">
            {match
              ? `Já existe um currículo com esse nome: este será salvo como versão ${match.nextVersion}.`
              : "Usando um nome já existente, o texto vira uma nova versão desse currículo."}
          </p>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <label htmlFor="rawText" className="block text-sm font-medium">Texto do currículo</label>
          <div>
            <input
              ref={fileRef}
              id="pdf"
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(e) => onPickFile(e.target.files?.[0])}
              disabled={extracting}
            />
            <label
              htmlFor="pdf"
              className={`inline-block cursor-pointer rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 focus-within:ring-2 dark:border-zinc-700 dark:hover:bg-zinc-900 ${
                extracting ? "pointer-events-none opacity-60" : ""
              }`}
            >
              {extracting ? "Lendo PDF…" : "Importar de um PDF"}
            </label>
          </div>
        </div>

        {pdfMessage && (
          <p
            role={pdfMessage.kind === "error" ? "alert" : "status"}
            className={`mt-2 text-sm ${pdfMessage.kind === "error" ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}
          >
            {pdfMessage.text}
          </p>
        )}

        <textarea
          id="rawText"
          name="rawText"
          rows={14}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Cole aqui o texto do seu currículo (experiências, formação, projetos, tecnologias…)"
          aria-invalid={Boolean(errors.rawText) || tooLong}
          aria-describedby="rawText-info"
          className={`${fieldClass} font-mono leading-relaxed ${
            errors.rawText ? "border-red-500" : "border-zinc-300 dark:border-zinc-700"
          }`}
        />
        <div id="rawText-info" className="mt-1 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs">
          <span role={errors.rawText ? "alert" : undefined} className={errors.rawText ? "text-red-600 dark:text-red-400" : "text-zinc-500"}>
            {errors.rawText?.[0] ?? `De ${RESUME_MIN_CHARS} a ${RESUME_MAX_CHARS.toLocaleString("pt-BR")} caracteres. PDF de até 5 MB.`}
          </span>
          <span className={tooShort || tooLong ? "text-red-600 dark:text-red-400" : "text-zinc-500"}>
            {chars.toLocaleString("pt-BR")} caracteres
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={saving || extracting}
          className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Salvando…" : "Salvar currículo"}
        </button>
        <p
          aria-live="polite"
          className={`min-w-0 text-sm ${
            state.status === "success"
              ? "text-emerald-700 dark:text-emerald-400"
              : state.status === "duplicate"
                ? "text-amber-700 dark:text-amber-400"
                : "text-red-600 dark:text-red-400"
          }`}
        >
          {!saving && state.message}
        </p>
      </div>
    </form>
  );
}
