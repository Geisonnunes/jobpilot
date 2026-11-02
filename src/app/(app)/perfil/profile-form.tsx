"use client";

import { startTransition, useActionState, useState } from "react";
import { TagInput } from "@/components/tag-input";
import {
  LANGUAGE_LEVELS,
  MAX_LANGUAGES,
  SENIORITIES,
  UFS,
  WORK_MODES,
  type LanguageEntry,
  type ProfileFormState,
  type ProfileFormValues,
} from "@/lib/profile";
import { saveProfile } from "./actions";

const initialState: ProfileFormState = { status: "idle" };

const inputClass =
  "mt-1.5 block w-full min-w-0 rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-600/40";
const inlineInputClass =
  "block min-w-0 rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-600/40";
const borderOk = "border-zinc-300 dark:border-zinc-700";
const borderErr = "border-red-500";

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
      {messages[0]}
    </p>
  );
}

/**
 * Todos os campos são controlados: o React limpa formulários não controlados
 * após a Server Action, e o usuário não pode perder o que digitou em caso de erro.
 */
export function ProfileForm({ initial, isNew }: { initial: ProfileFormValues; isNew: boolean }) {
  const [state, formAction, pending] = useActionState(saveProfile, initialState);
  const [v, setV] = useState<ProfileFormValues>(initial);
  const errors = state.errors ?? {};

  const set = <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));

  const border = (field: string) => (errors[field]?.length ? borderErr : borderOk);
  const describedBy = (field: string) => (errors[field]?.length ? `${field}-error` : undefined);

  function setLanguage(i: number, patch: Partial<LanguageEntry>) {
    set(
      "languages",
      v.languages.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    );
  }

  return (
    <form
      onSubmit={(e) => {
        // Evita o reset automático de <form action={...}>: com campos controlados,
        // selects e checkboxes voltariam ao valor inicial após um erro de validação.
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="mt-8 space-y-8"
      noValidate
    >
      {isNew && (
        <p className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          Preenchemos algumas sugestões para quem busca vaga de front-end júnior no Brasil. Ajuste o que quiser e salve.
        </p>
      )}

      {/* Dados básicos */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-500 uppercase">Sobre você</h2>

        <div>
          <label htmlFor="headline" className="block text-sm font-medium">Título profissional</label>
          <input
            id="headline"
            name="headline"
            value={v.headline}
            onChange={(e) => set("headline", e.target.value)}
            placeholder="Desenvolvedor Front-end Júnior"
            aria-invalid={Boolean(errors.headline)}
            aria-describedby={describedBy("headline")}
            className={`${inputClass} ${border("headline")}`}
          />
          <FieldError id="headline-error" messages={errors.headline} />
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_8rem_6rem]">
          <div className="min-w-0">
            <label htmlFor="city" className="block text-sm font-medium">Cidade</label>
            <input
              id="city"
              name="city"
              value={v.city}
              onChange={(e) => set("city", e.target.value)}
              aria-invalid={Boolean(errors.city)}
              aria-describedby={describedBy("city")}
              className={`${inputClass} ${border("city")}`}
            />
            <FieldError id="city-error" messages={errors.city} />
          </div>
          <div className="min-w-0">
            <label htmlFor="state" className="block text-sm font-medium">UF</label>
            <select
              id="state"
              name="state"
              value={v.state}
              onChange={(e) => set("state", e.target.value)}
              aria-invalid={Boolean(errors.state)}
              aria-describedby={describedBy("state")}
              className={`${inputClass} ${border("state")} dark:bg-zinc-900`}
            >
              <option value="">—</option>
              {UFS.map((uf) => (
                <option key={uf} value={uf}>{uf}</option>
              ))}
            </select>
            <FieldError id="state-error" messages={errors.state} />
          </div>
          <div className="min-w-0">
            <label htmlFor="country" className="block text-sm font-medium">País</label>
            <input
              id="country"
              name="country"
              value={v.country}
              maxLength={2}
              onChange={(e) => set("country", e.target.value.toUpperCase())}
              aria-invalid={Boolean(errors.country)}
              aria-describedby={describedBy("country")}
              className={`${inputClass} ${border("country")}`}
            />
            <FieldError id="country-error" messages={errors.country} />
          </div>
        </div>

        <div className="sm:max-w-xs">
          <label htmlFor="seniority" className="block text-sm font-medium">Senioridade</label>
          <select
            id="seniority"
            name="seniority"
            value={v.seniority}
            onChange={(e) => set("seniority", e.target.value)}
            aria-invalid={Boolean(errors.seniority)}
            aria-describedby={describedBy("seniority")}
            className={`${inputClass} ${border("seniority")} dark:bg-zinc-900`}
          >
            {SENIORITIES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <FieldError id="seniority-error" messages={errors.seniority} />
        </div>
      </section>

      {/* O que você procura */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-500 uppercase">O que você procura</h2>

        <TagInput
          name="targetRoles"
          label="Cargos desejados"
          hint="Digite e pressione Enter ou vírgula."
          value={v.targetRoles}
          onChange={(x) => set("targetRoles", x)}
          error={errors.targetRoles?.[0]}
        />
        <TagInput
          name="skills"
          label="Tecnologias"
          value={v.skills}
          onChange={(x) => set("skills", x)}
          error={errors.skills?.[0]}
        />

        <fieldset aria-describedby={describedBy("workModes")}>
          <legend className="text-sm font-medium">Modalidade de trabalho</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {WORK_MODES.map((m) => {
              const checked = v.workModes.includes(m.value);
              return (
                <label
                  key={m.value}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    errors.workModes?.length ? borderErr : borderOk
                  } ${checked ? "bg-emerald-50 dark:bg-emerald-950/30" : ""}`}
                >
                  <input
                    type="checkbox"
                    name="workModes"
                    value={m.value}
                    checked={checked}
                    onChange={() =>
                      set("workModes", checked ? v.workModes.filter((w) => w !== m.value) : [...v.workModes, m.value])
                    }
                    className="size-4 accent-emerald-600"
                  />
                  {m.label}
                </label>
              );
            })}
          </div>
          <FieldError id="workModes-error" messages={errors.workModes} />
        </fieldset>

        <div className="sm:max-w-xs">
          <label htmlFor="salaryMin" className="block text-sm font-medium">Pretensão salarial mínima (mensal)</label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 mt-[3px] -translate-y-1/2 text-sm text-zinc-500">R$</span>
            <input
              id="salaryMin"
              name="salaryMin"
              inputMode="decimal"
              value={v.salaryMin}
              onChange={(e) => set("salaryMin", e.target.value)}
              placeholder="3.500,00"
              aria-invalid={Boolean(errors.salaryMin)}
              aria-describedby={describedBy("salaryMin")}
              className={`${inputClass} ${border("salaryMin")} pl-9`}
            />
          </div>
          <input type="hidden" name="salaryCurrency" value="BRL" />
          <FieldError id="salaryMin-error" messages={errors.salaryMin} />
          <p className="mt-1 text-xs text-zinc-500">Opcional. Em reais.</p>
        </div>
      </section>

      {/* Filtros */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-500 uppercase">Filtros de vagas</h2>

        <div className="sm:max-w-xs">
          <label htmlFor="minMatchScore" className="block text-sm font-medium">Score mínimo de compatibilidade</label>
          <input
            id="minMatchScore"
            name="minMatchScore"
            type="number"
            min={1}
            max={5}
            step={0.5}
            value={v.minMatchScore}
            onChange={(e) => set("minMatchScore", e.target.value)}
            aria-invalid={Boolean(errors.minMatchScore)}
            aria-describedby={describedBy("minMatchScore")}
            className={`${inputClass} ${border("minMatchScore")}`}
          />
          <FieldError id="minMatchScore-error" messages={errors.minMatchScore} />
          <p className="mt-1 text-xs text-zinc-500">
            De 1,0 a 5,0, em passos de 0,5. Vagas com score abaixo disso não serão recomendadas.
          </p>
        </div>

        <TagInput
          name="excludeKeywords"
          label="Palavras que descartam uma vaga"
          hint="Vagas que contenham alguma delas serão ignoradas. Ex.: Sênior, PHP."
          value={v.excludeKeywords}
          onChange={(x) => set("excludeKeywords", x)}
          error={errors.excludeKeywords?.[0]}
        />
      </section>

      {/* Links */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-500 uppercase">Links</h2>
        {(
          [
            ["linkedinUrl", "LinkedIn", "https://www.linkedin.com/in/seu-perfil"],
            ["githubUrl", "GitHub", "https://github.com/seu-usuario"],
            ["portfolioUrl", "Portfólio", "https://seusite.dev"],
          ] as const
        ).map(([field, label, placeholder]) => (
          <div key={field}>
            <label htmlFor={field} className="block text-sm font-medium">{label}</label>
            <input
              id={field}
              name={field}
              type="text"
              inputMode="url"
              value={v[field]}
              onChange={(e) => set(field, e.target.value)}
              placeholder={placeholder}
              aria-invalid={Boolean(errors[field])}
              aria-describedby={describedBy(field)}
              className={`${inputClass} ${border(field)}`}
            />
            <FieldError id={`${field}-error`} messages={errors[field]} />
          </div>
        ))}
      </section>

      {/* Idiomas */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-500 uppercase">Idiomas</h2>
        {v.languages.map((l, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              name="languageLang"
              value={l.lang}
              onChange={(e) => setLanguage(i, { lang: e.target.value })}
              placeholder="Inglês"
              aria-label={`Idioma ${i + 1}`}
              className={`${inlineInputClass} min-w-32 flex-1 basis-40 ${borderOk}`}
            />
            <select
              name="languageLevel"
              value={l.level}
              onChange={(e) => setLanguage(i, { level: e.target.value as LanguageEntry["level"] })}
              aria-label={`Nível do idioma ${i + 1}`}
              className={`${inlineInputClass} flex-1 basis-36 ${borderOk} dark:bg-zinc-900`}
            >
              {LANGUAGE_LEVELS.map((lv) => (
                <option key={lv.value} value={lv.value}>{lv.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => set("languages", v.languages.filter((_, idx) => idx !== i))}
              className="rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Remover
            </button>
          </div>
        ))}
        <FieldError id="languages-error" messages={errors.languages} />
        {v.languages.length < MAX_LANGUAGES && (
          <button
            type="button"
            onClick={() => set("languages", [...v.languages, { lang: "", level: "basic" }])}
            className="rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
          >
            + Adicionar idioma
          </button>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Salvando…" : "Salvar perfil"}
        </button>
        <p
          aria-live="polite"
          className={`text-sm ${state.status === "error" ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}
        >
          {!pending && state.message}
        </p>
      </div>
    </form>
  );
}
