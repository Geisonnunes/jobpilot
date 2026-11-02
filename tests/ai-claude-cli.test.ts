import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { buildChildEnv, buildClaudeArgs, createClaudeCliProvider, parseClaudeOutput } from "@/server/ai/providers/claude-cli";
import { AiProviderError } from "@/server/ai/provider";

const SECRET = "CURRICULO-SECRETO-123";

interface Call { command: string; args: readonly string[]; options: SpawnOptions; stdin: string }

function fakeSpawn(behavior: { stdout?: string; code?: number; stderr?: string; hang?: boolean; spawnError?: boolean }) {
  const calls: Call[] = [];
  const killed = { value: false };
  const spawn = (command: string, args: readonly string[], options: SpawnOptions) => {
    const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough; stdin: PassThrough; kill: () => boolean };
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = () => {
      killed.value = true;
      return true;
    };
    const call: Call = { command, args, options, stdin: "" };
    calls.push(call);
    child.stdin.on("data", (d: Buffer) => (call.stdin += d.toString()));
    child.stdin.on("end", () => {
      if (behavior.hang) return;
      setImmediate(() => {
        if (behavior.spawnError) return child.emit("error", new Error(`ENOENT ${SECRET}`));
        if (behavior.stderr) child.stderr.write(behavior.stderr);
        if (behavior.stdout) child.stdout.write(behavior.stdout);
        child.emit("close", behavior.code ?? 0);
      });
    });
    return child as unknown as ChildProcess;
  };
  return { spawn, calls, killed };
}

const okOutput = JSON.stringify({
  type: "result", is_error: false, result: '{"ok":true}', total_cost_usd: 0.0123,
  usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 30, cache_creation_input_tokens: 40 },
  modelUsage: { "claude-sonnet-5-5": {} },
});

const request = { system: "SISTEMA", user: `Currículo: ${SECRET}`, maxOutputTokens: 1000, task: "MATCH" as const };

function make(behavior: Parameters<typeof fakeSpawn>[0], extra: { timeoutMs?: number; defaultModel?: string } = {}) {
  const f = fakeSpawn(behavior);
  const dirs = { made: [] as string[], removed: [] as string[] };
  const provider = createClaudeCliProvider(
    { executable: "claude", defaultModel: extra.defaultModel, env: { PATH: "/bin", ANTHROPIC_API_KEY: "sk-x", DATABASE_URL: "postgres://x", AUTH_SECRET: "s", HOME: "/h" } as unknown as NodeJS.ProcessEnv },
    {
      spawn: f.spawn,
      makeTempDir: async () => {
        const d = "/tmp/jobpilot-ai-test";
        dirs.made.push(d);
        return d;
      },
      removeDir: async (d) => void dirs.removed.push(d),
      timeoutMs: extra.timeoutMs,
    },
  );
  return { ...f, provider, dirs };
}

describe("claude-cli: montagem da chamada", () => {
  it("usa spawn sem shell, ferramentas desativadas, sessão não persistida e sem pular permissões", async () => {
    const t = make({ stdout: okOutput });
    await t.provider.complete(request);
    const { command, args, options } = t.calls[0];
    expect(command).toBe("claude");
    expect(options.shell).toBe(false);
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args).toContain("--no-session-persistence");
    expect(args).toContain("--safe-mode");
    expect(args[args.indexOf("--output-format") + 1]).toBe("json");
    expect(args).toContain("-p");
    expect(args).not.toContain("--dangerously-skip-permissions");
    expect(args).not.toContain("--allow-dangerously-skip-permissions");
    expect(args).not.toContain("--allowedTools");
    expect(args).not.toContain("--add-dir");
    expect(args[args.indexOf("--permission-mode") + 1]).toBe("dontAsk");
    expect(args[args.indexOf("--system-prompt") + 1]).toBe("SISTEMA");
  });

  it("envia o prompt pelo stdin e nunca em argumentos", async () => {
    const t = make({ stdout: okOutput });
    await t.provider.complete(request);
    expect(t.calls[0].stdin).toBe(request.user);
    expect(JSON.stringify(t.calls[0].args)).not.toContain(SECRET);
  });

  it("roda numa pasta temporária (não no projeto) e a apaga depois, inclusive em erro", async () => {
    const ok = make({ stdout: okOutput });
    await ok.provider.complete(request);
    expect(ok.calls[0].options.cwd).toBe("/tmp/jobpilot-ai-test");
    expect(ok.calls[0].options.cwd).not.toBe(process.cwd());
    expect(ok.dirs.removed).toEqual(ok.dirs.made);

    const bad = make({ stdout: "", code: 1 });
    await bad.provider.complete(request).catch(() => undefined);
    expect(bad.dirs.removed).toEqual(bad.dirs.made);
  });

  it("não repassa chaves e segredos ao processo filho", async () => {
    const t = make({ stdout: okOutput });
    await t.provider.complete(request);
    const env = t.calls[0].options.env as Record<string, string>;
    expect(env.PATH).toBe("/bin");
    expect(env.HOME).toBe("/h");
    expect(env).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(env).not.toHaveProperty("DATABASE_URL");
    expect(env).not.toHaveProperty("AUTH_SECRET");
    expect(buildChildEnv({ AI_PROVIDER: "x", CLAUDE_CLI_PATH: "y", Z: "1" } as unknown as NodeJS.ProcessEnv)).toEqual({ Z: "1" });
  });

  it("passa --model só quando houver modelo", async () => {
    expect(buildClaudeArgs("s")).not.toContain("--model");
    expect(buildClaudeArgs("s", "sonnet")).toEqual(expect.arrayContaining(["--model", "sonnet"]));
    const t = make({ stdout: okOutput }, { defaultModel: "opus" });
    await t.provider.complete(request);
    expect(t.calls[0].args).toEqual(expect.arrayContaining(["--model", "opus"]));
  });

  it("recusa executável .cmd/.bat (exigiria shell)", () => {
    expect(() => createClaudeCliProvider({ executable: "C:\\x\\claude.cmd" })).toThrow(AiProviderError);
    expect(() => createClaudeCliProvider({ executable: "claude.BAT" })).toThrow(/shell/);
  });
});

describe("claude-cli: saída e erros", () => {
  it("lê texto, tokens, custo e modelo da saída JSON", async () => {
    const r = await make({ stdout: okOutput }).provider.complete(request);
    expect(r).toMatchObject({ text: '{"ok":true}', inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40, costMicroUsd: 12300, model: "claude-sonnet-5-5" });
  });
  it("registra 0 quando a saída não traz tokens/custo", () => {
    const r = parseClaudeOutput(JSON.stringify({ is_error: false, result: "x" }), "");
    expect(r).toMatchObject({ inputTokens: 0, outputTokens: 0, costMicroUsd: 0, model: "default" });
  });
  it("erros não incluem prompt, stdout nem stderr", async () => {
    const cases = [
      make({ stdout: SECRET, code: 1, stderr: `erro ${SECRET}` }), // saída com código ≠ 0
      make({ stdout: `não é json ${SECRET}` }), // JSON inválido
      make({ stdout: JSON.stringify({ is_error: true, result: SECRET }) }), // erro do CLI
      make({ spawnError: true }), // falha ao executar
    ];
    for (const t of cases) {
      const err = await t.provider.complete(request).catch((e: Error) => e);
      expect(err).toBeInstanceOf(AiProviderError);
      expect(String((err as Error).message)).not.toContain(SECRET);
      expect(JSON.stringify(err)).not.toContain(SECRET);
    }
  });
  it("timeout: mata o processo e falha sem vazar o prompt", async () => {
    vi.useFakeTimers();
    try {
      const t = make({ hang: true }, { timeoutMs: 1000 });
      const pending = t.provider.complete(request).catch((e: Error) => e);
      await vi.advanceTimersByTimeAsync(1500);
      const err = await pending;
      expect(t.killed.value).toBe(true);
      expect(err).toMatchObject({ code: "timeout" });
      expect(String((err as Error).message)).not.toContain(SECRET);
      expect(t.dirs.removed).toEqual(t.dirs.made);
    } finally {
      vi.useRealTimers();
    }
  });
});
