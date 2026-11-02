"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { UFS, WORK_MODES } from "@/lib/profile";
import { createManualJob, type ManualJobState } from "../actions";

const initialState: ManualJobState = { status: "idle" };
const field =
  "mt-1.5 block w-full min-w-0 rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-600/40";

/** Campos controlados + onSubmit/startTransition: o que foi digitado não se perde após um erro. */
export function ManualJobForm() {
  const [state, formAction, pending] = useActionState(createManualJob, initialState);
  const [v, setV] = useState({ url: "", title: "", company: "", description: "", city: "", state: "", workMode: "" });
  const errors = state.errors ?? {};
  const set = (key: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setV((prev) => ({ ...prev, [key]: e.target.value }));
  const cls = (name: string) => `${field} ${errors[name] ? "border-red-500" : "border-zinc-300 dark:border-zinc-700"}`;
  const err = (name: string) =>
    errors[name]?.[0] ? <p id={`${name}-error`} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{errors[name]![0]}</p> : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      noValidate
      className="mt-6 space-y-5"
    >
      <div>
        <label htmlFor="url" className="block text-sm font-medium">URL da vaga</label>
        <input id="url" name="url" inputMode="url" value={v.url} onChange={set("url")} placeholder="https://www.linkedin.com/jobs/view/…"
          aria-invalid={Boolean(errors.url)} aria-describedby={errors.url ? "url-error" : undefined} className={cls("url")} />
        {err("url")}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor="title" className="block text-sm font-medium">Título</label>
          <input id="title" name="title" value={v.title} onChange={set("title")} placeholder="Desenvolvedor Front-end Júnior"
            aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? "title-error" : undefined} className={cls("title")} />
          {err("title")}
        </div>
        <div className="min-w-0">
          <label htmlFor="company" className="block text-sm font-medium">Empresa</label>
          <input id="company" name="company" value={v.company} onChange={set("company")}
            aria-invalid={Boolean(errors.company)} aria-describedby={errors.company ? "company-error" : undefined} className={cls("company")} />
          {err("company")}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_7rem_1fr]">
        <div className="min-w-0">
          <label htmlFor="city" className="block text-sm font-medium">Cidade</label>
          <input id="city" name="city" value={v.city} onChange={set("city")} className={cls("city")} />
          {err("city")}
        </div>
        <div className="min-w-0">
          <label htmlFor="state" className="block text-sm font-medium">UF</label>
          <select id="state" name="state" value={v.state} onChange={set("state")} className={`${cls("state")} dark:bg-zinc-900`}>
            <option value="">—</option>
            {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
          </select>
          {err("state")}
        </div>
        <div className="min-w-0">
          <label htmlFor="workMode" className="block text-sm font-medium">Modalidade</label>
          <select id="workMode" name="workMode" value={v.workMode} onChange={set("workMode")} className={`${cls("workMode")} dark:bg-zinc-900`}>
            <option value="">Não informada</option>
            {WORK_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          {err("workMode")}
        </div>
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium">Descrição da vaga</label>
        <textarea id="description" name="description" rows={12} value={v.description} onChange={set("description")}
          placeholder="Cole aqui a descrição completa da vaga"
          aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? "description-error" : undefined}
          className={`${cls("description")} leading-relaxed`} />
        {err("description")}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending}
          className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
          {pending ? "Salvando…" : "Salvar vaga"}
        </button>
        <p aria-live="polite" className={`min-w-0 text-sm ${state.status === "duplicate" ? "text-amber-700 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
          {!pending && state.message}
          {!pending && state.existingId && (
            <> <Link href={`/vagas/${state.existingId}`} className="underline">Ver a vaga existente</Link></>
          )}
        </p>
      </div>
    </form>
  );
}
