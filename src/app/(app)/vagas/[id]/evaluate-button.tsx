"use client";

import { useState, useTransition } from "react";
import { evaluateJob } from "../actions";

/** Dispara a avaliação de uma vaga. A avaliação pode levar até ~1 minuto (claude-cli). */
export function EvaluateButton({ postingId, reevaluate }: { postingId: string; reevaluate: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await evaluateJob(postingId, reevaluate);
        if (!result.ok) setError(result.message ?? "Não foi possível avaliar.");
      } catch {
        setError("Não foi possível avaliar agora. Tente novamente.");
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={
          reevaluate
            ? "rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
            : "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        }
      >
        {pending ? "Avaliando…" : reevaluate ? "Reavaliar" : "Avaliar compatibilidade"}
      </button>
      {pending && <p className="mt-2 text-sm text-zinc-500">Avaliando… pode levar até 1 minuto. Não feche esta página.</p>}
      <div aria-live="polite">{error && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}</div>
    </div>
  );
}
