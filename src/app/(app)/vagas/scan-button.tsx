"use client";

import { useState, useTransition } from "react";
import { scanNow, type ScanNowResult } from "./actions";

export function ScanButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ScanNowResult | null>(null);
  const [failed, setFailed] = useState(false);

  function run() {
    setResult(null);
    setFailed(false);
    startTransition(async () => {
      try {
        setResult(await scanNow());
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Buscando vagas…" : "Buscar vagas agora"}
      </button>
      {pending && <p className="mt-2 text-sm text-zinc-500">Consultando as fontes, isso pode levar alguns segundos.</p>}

      <div aria-live="polite">
        {failed && <p className="mt-3 text-sm text-red-600 dark:text-red-400">Não foi possível concluir a busca. Tente novamente.</p>}
        {result?.message && <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{result.message}</p>}
        {result && result.summaries.length > 0 && (
          <ul className="mt-3 space-y-2">
            {result.summaries.map((s) => (
              <li key={s.source} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
                <span className="font-medium">{s.sourceName}: </span>
                {s.skipped ? (
                  <span className="text-amber-700 dark:text-amber-400">{s.skipped}</span>
                ) : (
                  <span>
                    {s.newCount} nova(s), {s.updatedCount} atualizada(s), {s.duplicateCount} duplicada(s), {s.errorCount} erro(s)
                    {" "}de {s.fetched} lida(s)
                    {s.status === "FAILED" && <span className="text-red-600 dark:text-red-400"> · a coleta falhou</span>}
                    {s.status === "PARTIAL" && <span className="text-amber-700 dark:text-amber-400"> · coleta parcial</span>}
                  </span>
                )}
                {s.errors.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-xs text-zinc-500">
                    {s.errors.slice(0, 3).map((e, i) => (
                      <li key={i}>{e.message}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
