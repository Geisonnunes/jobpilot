"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteResume, setPrimaryResume } from "./actions";

export type ResumeVersion = {
  id: string;
  version: number;
  isPrimary: boolean;
  chars: number;
  updatedAt: string;
  matches: number;
  documents: number;
  applications: number;
};
export type ResumeGroup = { label: string; versions: ResumeVersion[] };

const smallButton =
  "rounded-md px-2.5 py-1 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:text-zinc-300 dark:hover:bg-zinc-800";

export function ResumeGroupList({ groups }: { groups: ResumeGroup[] }) {
  return (
    <ul className="space-y-4">
      {groups.map((g) => (
        <li key={g.label.toLowerCase()} className="rounded-xl border border-zinc-200 dark:border-zinc-800">
          <h3 className="border-b border-zinc-200 px-4 py-3 font-medium break-words dark:border-zinc-800">{g.label}</h3>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {g.versions.map((v) => (
              <VersionRow key={v.id} v={v} />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function VersionRow({ v }: { v: ResumeVersion }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run(action: (id: string) => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await action(v.id);
      if (!res.ok) setError(res.message ?? "Não foi possível concluir a ação.");
      else setConfirming(false);
    });
  }

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">Versão {v.version}</span>
        {v.isPrimary && (
          <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">Principal</span>
        )}
        <span className="text-sm text-zinc-500">
          {v.chars.toLocaleString("pt-BR")} caracteres · atualizado em {v.updatedAt}
        </span>
      </div>

      <div className="mt-2 -ml-2.5 flex flex-wrap gap-1">
        <Link href={`/curriculo/${v.id}`} className={smallButton}>Ver texto</Link>
        <Link href={`/curriculo?base=${v.id}#novo`} className={smallButton}>Nova versão</Link>
        {!v.isPrimary && (
          <button type="button" disabled={pending} onClick={() => run(setPrimaryResume)} className={smallButton}>
            {pending && !confirming ? "Salvando…" : "Tornar principal"}
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirming(true)}
          className={`${smallButton} text-red-600 dark:text-red-400`}
        >
          Excluir
        </button>
      </div>

      {confirming && (
        <div role="alertdialog" aria-label="Confirmar exclusão" className="mt-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
          <p className="font-medium">Excluir a versão {v.version} permanentemente?</p>
          <p className="mt-1 text-zinc-700 dark:text-zinc-300">
            {v.matches} avaliação(ões) de vaga e {v.documents} documento(s) gerado(s) dependem dela e serão apagados
            junto.
            {v.applications > 0 &&
              ` ${v.applications} candidatura(s) permanecerão, mas perderão a referência a este currículo.`}
            {v.isPrimary && " Como ela é a principal, a versão mais recente que restar será promovida a principal."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(deleteResume)}
              className="rounded-md bg-red-600 px-3 py-1.5 text-white hover:bg-red-700 disabled:opacity-60"
            >
              {pending ? "Excluindo…" : "Confirmar exclusão"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(false)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-white dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </li>
  );
}
