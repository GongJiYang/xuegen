// @vitest-environment node
// `scripts.ts` budget: the default 15s timeout, the optional per-call override,
// and that the timeout sentence quotes the budget the run actually used.
// `node:child_process` is mocked so no real script process is spawned.
import { describe, expect, it, vi } from "vitest";

const execFileMock = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}));

import { runScript, runScriptPlain } from "./scripts.js";

type Done = (error: unknown, stdout: string, stderr: string) => void;

/** Make the next spawn settle immediately with the given outcome. */
function reply(error: unknown, stdout = "", stderr = ""): void {
  execFileMock.mockImplementationOnce(
    (_executable: string, _argv: string[], _options: unknown, done: Done) => {
      done(error, stdout, stderr);
    },
  );
}

/** The (script, args, timeout) of the last spawn; `execFile` gets node + [script, ...args]. */
function lastSpawn(): { script: string; args: string[]; timeout: number } {
  const call = execFileMock.mock.calls.at(-1);
  expect(call).toBeDefined();
  const argv = call?.[1] as string[];
  const options = call?.[2] as { timeout: number };
  const [script, ...args] = argv;
  return { script: script ?? "", args, timeout: options.timeout };
}

describe("runScript", () => {
  it("uses the 15 second default when no budget is given", async () => {
    reply(null, '{"added":1}');
    const result = await runScript("wiki-save/flashcards.mjs", ["stats", "/v", "--json"]);
    expect(result).toEqual({ ok: true, data: { added: 1 } });
    const spawn = lastSpawn();
    expect(spawn.script).toContain("wiki-save/flashcards.mjs");
    expect(spawn.args).toEqual(["stats", "/v", "--json"]);
    expect(spawn.timeout).toBe(15_000);
  });

  it("honours a caller-supplied timeout", async () => {
    reply(null, "{}");
    await runScript("wiki-save/anki-sync.mjs", ["push", "/v", "--json"], { timeoutMs: 120_000 });
    expect(lastSpawn().timeout).toBe(120_000);
  });

  it("quotes the actual budget in the timeout message", async () => {
    const error = Object.assign(new Error("Command failed"), { killed: true, signal: "SIGTERM" });
    reply(error);
    const result = await runScript("wiki-save/anki-sync.mjs", ["push", "/v"], { timeoutMs: 120_000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("超时（120 秒）");
  });

  it("reports the script path and stderr for a plain failure", async () => {
    reply(Object.assign(new Error("exit 1"), { code: 1 }), "", "连不上 Anki：请打开 Anki");
    const result = await runScript("wiki-save/anki-sync.mjs", ["push", "/v"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("script-failed");
      expect(result.error).toContain("wiki-save/anki-sync.mjs");
      expect(result.error).toContain("连不上 Anki");
    }
  });

  it("fails on non-JSON stdout", async () => {
    reply(null, "not json");
    const result = await runScript("reading/bookshelf.mjs", ["list", "/v", "--json"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("输出不是合法 JSON");
  });
});

describe("runScriptPlain", () => {
  it("ignores stdout and keeps the default budget", async () => {
    reply(null, "noise");
    const result = await runScriptPlain("course/render-board.mjs", ["/courses", "/out.html"]);
    expect(result).toEqual({ ok: true, data: null });
    expect(lastSpawn().timeout).toBe(15_000);
  });

  it("honours a caller-supplied timeout", async () => {
    reply(null, "");
    await runScriptPlain("course/render-board.mjs", ["a", "b"], { timeoutMs: 60_000 });
    expect(lastSpawn().timeout).toBe(60_000);
  });
});
