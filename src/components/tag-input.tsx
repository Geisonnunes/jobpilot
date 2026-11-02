"use client";

import { useId, useState } from "react";

type Props = {
  name: string;
  label: string;
  hint?: string;
  placeholder?: string;
  value: string[];
  onChange: (next: string[]) => void;
  error?: string;
  max?: number;
};

/**
 * Campo de lista em "tags": Enter ou vírgula adiciona, X remove,
 * sem duplicatas (case-insensitive). Cada tag vai ao formulário como
 * um <input type="hidden" name={name}> separado.
 */
export function TagInput({ name, label, hint, placeholder, value, onChange, error, max = 30 }: Props) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");

  function commit(raw: string) {
    const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return;
    const next = [...value];
    let msg = "";
    for (const part of parts) {
      if (next.some((t) => t.toLowerCase() === part.toLowerCase())) {
        msg = `"${part}" já está na lista.`;
      } else if (next.length >= max) {
        msg = `Limite de ${max} itens atingido.`;
        break;
      } else {
        next.push(part);
      }
    }
    setNotice(msg);
    setDraft("");
    if (next.length !== value.length) onChange(next);
  }

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}

      <div
        className={`mt-1.5 flex min-w-0 flex-wrap gap-2 rounded-lg border bg-transparent p-2 focus-within:ring-2 focus-within:ring-emerald-600/40 ${
          error ? "border-red-500" : "border-zinc-300 dark:border-zinc-700"
        }`}
      >
        {value.map((tag) => (
          <span
            key={tag.toLowerCase()}
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-zinc-100 py-1 pr-1 pl-3 text-sm dark:bg-zinc-800"
          >
            <span className="min-w-0 break-words">{tag}</span>
            <button
              type="button"
              onClick={() => onChange(value.filter((t) => t !== tag))}
              aria-label={`Remover ${tag}`}
              className="flex size-5 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-700 dark:hover:text-white"
            >
              ×
            </button>
            <input type="hidden" name={name} value={tag} />
          </span>
        ))}
        <input
          id={id}
          type="text"
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(",")) commit(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault(); // não envia o formulário
              commit(draft);
            } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => commit(draft)}
          placeholder={value.length >= max ? `Limite de ${max} atingido` : (placeholder ?? "Digite e pressione Enter")}
          disabled={value.length >= max}
          aria-invalid={Boolean(error)}
          className="min-w-32 flex-1 bg-transparent px-1 py-1 text-sm outline-none"
        />
      </div>

      <div className="mt-1 flex justify-between gap-2 text-xs">
        <span role={error ? "alert" : undefined} className={error ? "text-red-600 dark:text-red-400" : "text-zinc-500"}>
          {error ?? notice}
        </span>
        <span className="shrink-0 text-zinc-500">
          {value.length}/{max}
        </span>
      </div>
    </div>
  );
}
