import type { AiProvider, AiRequest, AiResponse } from "@/server/ai/provider";
import type { UsageRecord, UsageStore } from "@/server/ai/usage";
import type { MatchKey, MatchStore, SaveMatchData, EvaluateInput } from "@/server/ai/match/evaluate";

export const RESUME_TEXT = [
  "Maria Souza",
  "Contato: maria@example.com | (11) 91234-5678 | https://linkedin.com/in/mariasouza",
  "Desenvolvedora front-end com projetos em React e TypeScript.",
  "Projeto: loja virtual em Next.js com testes em Vitest.",
  "Formação: Análise e Desenvolvimento de Sistemas, 2021-2023.",
].join("\n");

export const validResult = {
  score: 4.2,
  recommendation: "APPLY",
  dimensions: {
    cvMatch: { score: 4, reason: "Boa aderência." },
    goalAlignment: { score: 5, reason: "Cargo alvo." },
    compensation: { score: 3, reason: "Sem salário informado." },
    location: { score: 5, reason: "Remoto." },
    redFlags: { score: 4, reason: "Nenhum relevante." },
  },
  summary: "Boa vaga para o perfil.",
  matchedSkills: [
    { skill: "React", evidence: "projetos em React e TypeScript" },
    { skill: "Next.js", evidence: "LOJA   virtual em next.js" },
  ],
  missingSkills: ["GraphQL"],
  redFlags: [] as string[],
};

export function fakeResponse(text: string, over: Partial<AiResponse> = {}): AiResponse {
  return { text, inputTokens: 1000, outputTokens: 300, cacheReadTokens: 0, cacheWriteTokens: 0, costMicroUsd: 1234, latencyMs: 50, model: "fake-model", ...over };
}

export function fakeProvider(texts: string[], name: AiProvider["name"] = "claude-cli") {
  const requests: AiRequest[] = [];
  let i = 0;
  const provider: AiProvider = {
    name,
    async complete(request) {
      requests.push(request);
      const text = texts[Math.min(i++, texts.length - 1)];
      return fakeResponse(text);
    },
  };
  return { provider, requests };
}

export function memoryUsage(spent = 0) {
  const rows: Array<UsageRecord & { id: string }> = [];
  const store: UsageStore = {
    async record(data) {
      const id = `u${rows.length + 1}`;
      rows.push({ ...data, id });
      return { id };
    },
    async apiSpentMicroUsd() {
      return spent;
    },
    async markFailed(id, error) {
      const row = rows.find((r) => r.id === id);
      if (row) {
        row.success = false;
        row.error = error;
      }
    },
  };
  return { store, rows };
}

export function memoryMatches() {
  const saved = new Map<string, SaveMatchData & { id: string }>();
  const k = (key: MatchKey) => `${key.userId}|${key.postingId}|${key.resumeId}|${key.promptVersion}`;
  const store: MatchStore = {
    async find(key) {
      const m = saved.get(k(key));
      return m ? { id: m.id } : null;
    },
    async save(data) {
      const id = saved.get(k(data))?.id ?? `m${saved.size + 1}`;
      saved.set(k(data), { ...data, id });
      return { id };
    },
  };
  return { store, saved };
}

export function baseInput(over: Partial<EvaluateInput["posting"]> = {}, profileOver: Partial<EvaluateInput["profile"]> = {}): EvaluateInput {
  return {
    userId: "user1",
    userNames: ["Maria Souza", "Maria"],
    profile: {
      headline: null, targetRoles: ["Desenvolvedora Front-end"], skills: ["React", "TypeScript"], seniority: "JUNIOR",
      workModes: ["REMOTE", "HYBRID"], city: "São Paulo", state: "SP", country: "BR", salaryMin: 400000, salaryCurrency: "BRL",
      languages: [{ lang: "en", level: "basic" }], excludeKeywords: ["PHP"], minMatchScore: 4.0, ...profileOver,
    },
    resume: { id: "resume1", rawText: RESUME_TEXT },
    posting: {
      id: "post1", status: "OPEN", title: "Desenvolvedor Front-end Júnior", company: "Acme", location: "Remoto", workMode: "REMOTE",
      seniority: "JUNIOR", employmentType: "CLT", salaryMin: null, salaryMax: null, salaryCurrency: null,
      description: "Atuação com React e TypeScript em produtos web. ".repeat(10), ...over,
    },
  };
}
