import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AiProviderError, type AiProvider, type AiRequest, type AiResponse } from "../provider";

/**
 * Provedor que executa o Claude Code em modo headless na máquina do usuário
 * (usa a assinatura dele, sem chave de API).
 *
 * Segurança (verificada em tests/ai-claude-cli.test.ts):
 *  - spawn SEM shell, com argumentos em array (nunca uma string de comando);
 *  - o prompt do usuário (que contém o CV) vai pelo stdin, nunca por argumento;
 *  - cwd = pasta temporária vazia, criada para a chamada e apagada depois;
 *  - TODAS as ferramentas desativadas (--tools ""), sem pular permissões;
 *  - --safe-mode: não carrega CLAUDE.md, hooks, MCP, plugins nem skills;
 *  - sessão não persistida; sem ferramentas, a resposta é de um turno só;
 *  - timeout com kill do processo;
 *  - erros nunca incluem prompt, stdout nem stderr.
 *
 * Esta versão do CLI não tem flag de limite de turnos nem de tokens de saída
 * (conferido em `claude --help`), então maxOutputTokens não é aplicado aqui.
 */

export const CLAUDE_CLI_TIMEOUT_MS = 120_000;
const MAX_STDOUT_BYTES = 4 * 1024 * 1024;

type SpawnFn = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

export interface ClaudeCliDeps {
  spawn?: SpawnFn;
  makeTempDir?: () => Promise<string>;
  removeDir?: (dir: string) => Promise<void>;
  timeoutMs?: number;
}

export interface ClaudeCliOptions {
  /** Caminho do executável; padrão "claude" (procurado no PATH). */
  executable?: string;
  /** Modelo usado quando a chamada não pede um. Vazio: padrão do CLI. */
  defaultModel?: string;
  env?: NodeJS.ProcessEnv;
}

/** Variáveis que o processo filho não precisa ver (e que mudariam a cobrança/o login). */
const BLOCKED_ENV = /^(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|DATABASE_URL|AUTH_.*|AI_.*|CLAUDE_CLI_PATH)$/;

export function buildChildEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = {} as NodeJS.ProcessEnv;
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && !BLOCKED_ENV.test(key)) env[key] = value;
  }
  return env;
}

/** Argumentos fixos de segurança + modelo/system. O prompt do usuário NÃO entra aqui. */
export function buildClaudeArgs(system: string, model?: string): string[] {
  const args = [
    "-p",
    "--output-format", "json",
    "--tools", "",
    "--no-session-persistence",
    "--safe-mode",
    "--disable-slash-commands",
    "--strict-mcp-config",
    "--permission-mode", "dontAsk",
    "--system-prompt", system,
  ];
  if (model) args.push("--model", model);
  return args;
}

interface CliResult {
  result?: unknown;
  is_error?: unknown;
  total_cost_usd?: unknown;
  usage?: {
    input_tokens?: unknown;
    output_tokens?: unknown;
    cache_read_input_tokens?: unknown;
    cache_creation_input_tokens?: unknown;
  };
  modelUsage?: Record<string, unknown>;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

export function parseClaudeOutput(stdout: string, requestedModel: string): Omit<AiResponse, "latencyMs"> {
  let parsed: CliResult;
  try {
    parsed = JSON.parse(stdout) as CliResult;
  } catch {
    throw new AiProviderError("A saída do Claude CLI não é um JSON válido.", "output");
  }
  if (parsed.is_error === true || typeof parsed.result !== "string") {
    throw new AiProviderError("O Claude CLI retornou erro (confira o login rodando `claude` no terminal).", "output");
  }
  const reported = parsed.modelUsage ? Object.keys(parsed.modelUsage)[0] : undefined;
  return {
    text: parsed.result,
    inputTokens: num(parsed.usage?.input_tokens),
    outputTokens: num(parsed.usage?.output_tokens),
    cacheReadTokens: num(parsed.usage?.cache_read_input_tokens),
    cacheWriteTokens: num(parsed.usage?.cache_creation_input_tokens),
    costMicroUsd: Math.round(num(parsed.total_cost_usd) * 1_000_000),
    model: reported ?? (requestedModel || "default"),
  };
}

export function createClaudeCliProvider(options: ClaudeCliOptions = {}, deps: ClaudeCliDeps = {}): AiProvider {
  const spawn = deps.spawn ?? (nodeSpawn as SpawnFn);
  const makeTempDir = deps.makeTempDir ?? (() => mkdtemp(path.join(tmpdir(), "jobpilot-ai-")));
  const removeDir = deps.removeDir ?? ((dir: string) => rm(dir, { recursive: true, force: true }));
  const timeoutMs = deps.timeoutMs ?? CLAUDE_CLI_TIMEOUT_MS;
  const executable = options.executable || "claude";

  if (/\.(cmd|bat)$/i.test(executable)) {
    throw new AiProviderError("CLAUDE_CLI_PATH deve apontar para o executável (.exe), não para um .cmd/.bat (exigiria shell).", "config");
  }

  return {
    name: "claude-cli",
    async complete(request: AiRequest): Promise<AiResponse> {
      const model = request.model || options.defaultModel || "";
      const started = Date.now();
      const cwd = await makeTempDir();
      try {
        const stdout = await run(
          spawn, executable, buildClaudeArgs(request.system, model || undefined), request.user, cwd,
          buildChildEnv(options.env ?? process.env), timeoutMs,
        );
        return { ...parseClaudeOutput(stdout, model), latencyMs: Date.now() - started };
      } finally {
        await removeDir(cwd).catch(() => undefined);
      }
    },
  };
}

function run(
  spawn: SpawnFn, command: string, args: string[], stdin: string, cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    let child: ChildProcess;
    try {
      // shell: false explícito: nenhuma string de comando é montada.
      child = spawn(command, args, { cwd, env, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    } catch {
      reject(new AiProviderError("Não foi possível iniciar o Claude CLI.", "spawn"));
      return;
    }

    const timer = setTimeout(() => {
      child.kill();
      finish(() => reject(new AiProviderError(`O Claude CLI passou de ${Math.round(timeoutMs / 1000)} s e foi encerrado.`, "timeout")));
    }, timeoutMs);

    const chunks: Buffer[] = [];
    let size = 0;
    child.stdout?.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_STDOUT_BYTES) {
        child.kill();
        finish(() => reject(new AiProviderError("A saída do Claude CLI é grande demais.", "output")));
        return;
      }
      chunks.push(chunk);
    });
    child.stderr?.on("data", () => undefined); // descartado de propósito: pode ecoar trechos do prompt
    child.on("error", () =>
      finish(() => reject(new AiProviderError("Não foi possível executar o Claude CLI (está instalado? veja CLAUDE_CLI_PATH).", "spawn"))),
    );
    child.on("close", (code) => {
      finish(() => {
        if (code !== 0) reject(new AiProviderError(`O Claude CLI terminou com código ${code ?? "desconhecido"}.`, "exit"));
        else resolve(Buffer.concat(chunks).toString("utf8"));
      });
    });

    child.stdin?.on("error", () => undefined); // EPIPE se o processo morrer antes de ler tudo
    child.stdin?.end(stdin);
  });
}
