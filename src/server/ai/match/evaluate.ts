import { prefilterPosting, type PrefilterCode, type PrefilterPosting, type PrefilterProfile } from "../prefilter";
import type { AiProvider } from "../provider";
import { callAi, type UsageStore } from "../usage";
import {
  buildMatchUserPrompt,
  buildRetryUserPrompt,
  MATCH_MAX_OUTPUT_TOKENS,
  MATCH_SYSTEM_PROMPT,
  PROMPT_VERSION,
  type MatchPostingInput,
  type MatchProfileInput,
} from "./prompts/match-v1";
import { redactPii } from "./redact";
import { parseMatchResponse, recommendationFor, SUSPECT_NOTICE, verifyEvidence, type Recommendation } from "./result";

/**
 * Orquestra uma avaliação: pré-filtro → cache → prompt (CV sem dados pessoais) → IA →
 * validação (1 retry) → verificação de evidências → recomendação recalculada → JobMatch.
 * Provedor e acesso ao banco entram por parâmetro, então tudo é testável sem rede.
 */

export interface MatchKey {
  userId: string;
  postingId: string;
  resumeId: string;
  promptVersion: string;
}

export interface SaveMatchData extends MatchKey {
  model: string;
  aiUsageId: string;
  score: number;
  recommendation: Recommendation;
  dimensions: Record<string, unknown>;
  summary: string;
  missingSkills: string[];
  redFlags: string[];
}

export interface MatchStore {
  find(key: MatchKey): Promise<{ id: string } | null>;
  /** Upsert pela chave (userId, postingId, resumeId, promptVersion). */
  save(data: SaveMatchData): Promise<{ id: string }>;
}

export interface EvaluateInput {
  userId: string;
  /** Nomes a remover do CV (nome completo e primeiro nome). */
  userNames: string[];
  profile: MatchProfileInput & PrefilterProfile & { minMatchScore: number };
  resume: { id: string; rawText: string };
  posting: PrefilterPosting & MatchPostingInput & { id: string };
}

export interface EvaluateDeps {
  provider: AiProvider;
  usage: UsageStore;
  matches: MatchStore;
  model?: string;
  monthlyBudgetUsd: number;
}

export type EvaluateOutcome =
  | { status: "prefiltered"; code: PrefilterCode; reason: string }
  | { status: "cached"; matchId: string }
  | {
      status: "evaluated";
      matchId: string;
      score: number;
      recommendation: Recommendation;
      evidenceRemoved: number;
      suspect: boolean;
      attempts: number;
    }
  | { status: "invalid"; problem: string };

export async function evaluateMatch(input: EvaluateInput, deps: EvaluateDeps, options: { force?: boolean } = {}): Promise<EvaluateOutcome> {
  const filtered = prefilterPosting(input.posting, input.profile);
  if (!filtered.pass) return { status: "prefiltered", code: filtered.code, reason: filtered.reason };

  const key: MatchKey = { userId: input.userId, postingId: input.posting.id, resumeId: input.resume.id, promptVersion: PROMPT_VERSION };
  if (!options.force) {
    const existing = await deps.matches.find(key);
    if (existing) return { status: "cached", matchId: existing.id };
  }

  // O CV vai sem e-mail, telefone, CPF, endereço, links e nome.
  const resumeText = redactPii(input.resume.rawText, { names: input.userNames }).text;
  const basePrompt = buildMatchUserPrompt({ profile: input.profile, resumeText, posting: input.posting });

  let userPrompt = basePrompt;
  let lastProblem = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const call = await callAi({
      provider: deps.provider,
      store: deps.usage,
      userId: input.userId,
      monthlyBudgetUsd: deps.monthlyBudgetUsd,
      request: { system: MATCH_SYSTEM_PROMPT, user: userPrompt, model: deps.model, maxOutputTokens: MATCH_MAX_OUTPUT_TOKENS, task: "MATCH" },
    });

    const parsed = parseMatchResponse(call.response.text);
    if (!parsed.ok) {
      lastProblem = parsed.problem;
      await deps.usage.markFailed(call.usageId, `Resposta inválida: ${parsed.problem}`).catch(() => undefined);
      userPrompt = buildRetryUserPrompt(basePrompt, parsed.problem);
      continue;
    }

    const { result } = parsed;
    const evidence = verifyEvidence(result.matchedSkills, resumeText);
    const recommendation = recommendationFor(result.score, input.profile.minMatchScore);
    const summary = evidence.suspect ? `${SUSPECT_NOTICE} ${result.summary}` : result.summary;

    const saved = await deps.matches.save({
      ...key,
      model: call.modelLabel,
      aiUsageId: call.usageId,
      score: result.score,
      recommendation,
      summary,
      missingSkills: result.missingSkills,
      redFlags: result.redFlags,
      dimensions: {
        ...result.dimensions,
        matchedSkills: evidence.matchedSkills,
        evidenceRemoved: evidence.removed,
        suspect: evidence.suspect,
        aiRecommendation: result.recommendation,
      },
    });
    return { status: "evaluated", matchId: saved.id, score: result.score, recommendation, evidenceRemoved: evidence.removed, suspect: evidence.suspect, attempts: attempt };
  }

  return { status: "invalid", problem: lastProblem };
}
