import { MatchBadge } from "@/components/match-badge";
import { parseStoredDimensions, RECOMMENDATION_LABEL } from "@/server/ai/match/view";
import { EvaluateButton } from "./evaluate-button";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export interface MatchPanelData {
  id: string;
  score: { toString(): string };
  recommendation: "APPLY" | "MAYBE" | "SKIP";
  summary: string | null;
  dimensions: unknown;
  missingSkills: string[];
  redFlags: string[];
  promptVersion: string;
  model: string;
  createdAt: Date;
}

/** Bloco da avaliação de IA. Todo o conteúdo é texto puro (vem da IA a partir de dados externos). */
export function MatchPanel({ postingId, match, recommendation }: { postingId: string; match: MatchPanelData; recommendation: MatchPanelData["recommendation"] }) {
  const stored = parseStoredDimensions(match.dimensions);
  return (
    <section aria-labelledby="match-title" className="mt-8 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="match-title" className="text-sm font-medium text-zinc-500 uppercase">Avaliação de compatibilidade</h2>
        <MatchBadge score={match.score.toString()} recommendation={recommendation} />
      </div>

      {recommendation !== match.recommendation && (
        <p className="mt-2 text-xs text-zinc-500">
          Recomendação atualizada pela sua nota mínima atual. Na avaliação, era “{RECOMMENDATION_LABEL[match.recommendation]}”.
        </p>
      )}

      {match.summary && <p className="mt-3 text-sm leading-relaxed break-words">{match.summary}</p>}

      {stored.dimensions.length > 0 && (
        <ul className="mt-4 space-y-3">
          {stored.dimensions.map((d) => (
            <li key={d.key} className="text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{d.label}</span>
                <span className="shrink-0 text-zinc-500">{d.score}/5</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800" aria-hidden="true">
                <div className="h-1.5 rounded-full bg-emerald-600" style={{ width: `${Math.max(0, Math.min(5, d.score)) * 20}%` }} />
              </div>
              <p className="mt-1 break-words text-zinc-600 dark:text-zinc-400">{d.reason}</p>
            </li>
          ))}
        </ul>
      )}

      {stored.matchedSkills.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-medium">Skills encontradas no seu currículo</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {stored.matchedSkills.map((m, i) => (
              <li key={`${m.skill}-${i}`} className="break-words">
                <span className="font-medium">{m.skill}</span>
                <blockquote className="mt-0.5 border-l-2 border-emerald-600 pl-3 text-zinc-600 dark:text-zinc-400">“{m.evidence}”</blockquote>
              </li>
            ))}
          </ul>
        </>
      )}
      {stored.evidenceRemoved > 0 && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          {stored.evidenceRemoved} evidência(s) citada(s) pela IA não existem no currículo e foram removidas.
        </p>
      )}

      {match.missingSkills.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-medium">Skills que faltam</h3>
          <ul className="mt-2 flex flex-wrap gap-2 text-xs">
            {match.missingSkills.map((s, i) => (
              <li key={`${s}-${i}`} className="rounded-full bg-zinc-100 px-2 py-0.5 break-words dark:bg-zinc-800">{s}</li>
            ))}
          </ul>
        </>
      )}

      {match.redFlags.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-medium text-red-700 dark:text-red-400">Alertas</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm break-words">
            {match.redFlags.map((f, i) => <li key={`${f}-${i}`}>{f}</li>)}
          </ul>
        </>
      )}

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <p className="min-w-0 text-xs break-words text-zinc-500">
          Prompt {match.promptVersion} · {match.model} · {dateTime.format(match.createdAt)}
        </p>
        <EvaluateButton postingId={postingId} reevaluate />
      </div>
    </section>
  );
}
