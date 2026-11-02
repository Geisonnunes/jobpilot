import { RECOMMENDATION_LABEL } from "@/server/ai/match/view";

type Recommendation = keyof typeof RECOMMENDATION_LABEL;

const STYLE: Record<Recommendation, string> = {
  APPLY: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  MAYBE: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  SKIP: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

/** Selo com a nota: verde = APPLY, amarelo = MAYBE, cinza = SKIP. */
export function MatchBadge({ score, recommendation }: { score: number | string; recommendation: Recommendation }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STYLE[recommendation]}`}
      title={RECOMMENDATION_LABEL[recommendation]}
    >
      <span className="font-semibold">{Number(score).toFixed(1)}</span>
      <span>{RECOMMENDATION_LABEL[recommendation]}</span>
    </span>
  );
}
