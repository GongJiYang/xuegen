// @vitest-environment node
// `cards.sync` through the real handler: which script and flags it runs (`--dry-run`
// only for a dry run) and that a full sync gets the long 120 second budget.
// `node:child_process` is mocked so no real script or Anki is touched.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileMock = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}));

import { handleDataRequest } from "./handler.js";

/** Answer the next spawn with a fixed stdout; capture what was asked for. */
function stubScript(stdout: string): void {
  execFileMock.mockImplementationOnce(
    (_file: string, _args: string[], _options: { timeout: number }, done: (e: null, o: string, s: string) => void) => {
      done(null, stdout, "");
    },
  );
}

/** The (executable, argv, timeout) of the last spawn: argv[0] is the script. */
function lastSpawn(): { executable: string; script: string; args: string[]; timeout: number } {
  const call = execFileMock.mock.calls.at(-1);
  expect(call).toBeDefined();
  const [executable, argv, options] = call as unknown as [string, string[], { timeout: number }];
  const [script, ...args] = argv;
  return { executable, script: script ?? "", args, timeout: options.timeout };
}

const SYNC_RESULT = {
  added: 2,
  duplicates: [],
  failed: [],
  skipped: [],
  decks: ["书房::Epp"],
  presetMissing: false,
};

describe("cards.sync", () => {
  let home: string;
  let vault: string;
  const originalHome = process.env.XUEGEN_HOME;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "xuegen-cards-sync-home-"));
    vault = mkdtempSync(join(tmpdir(), "xuegen-cards-sync-vault-"));
    process.env.XUEGEN_HOME = home;
    mkdirSync(join(vault, "wiki"), { recursive: true });
    writeFileSync(join(home, "wiki.json"), JSON.stringify({ root: vault }), "utf8");
    execFileMock.mockReset();
  });

  afterEach(() => {
    process.env.XUEGEN_HOME = originalHome;
    rmSync(home, { recursive: true, force: true });
    rmSync(vault, { recursive: true, force: true });
  });

  it("runs anki-sync.mjs push with a 120 second budget", async () => {
    stubScript(JSON.stringify(SYNC_RESULT));
    const result = await handleDataRequest({ kind: "cards.sync", dryRun: false });
    expect(result).toEqual({ ok: true, data: SYNC_RESULT });
    const spawn = lastSpawn();
    expect(spawn.script).toContain(join("skills", "wiki-save", "anki-sync.mjs"));
    expect(spawn.args).toEqual(["push", vault, "--json"]);
    expect(spawn.timeout).toBe(120_000);
  });

  it("adds --dry-run for a dry run", async () => {
    stubScript(JSON.stringify({ ...SYNC_RESULT, added: 0 }));
    const result = await handleDataRequest({ kind: "cards.sync", dryRun: true });
    expect(result.ok).toBe(true);
    expect(lastSpawn().args).toEqual(["push", vault, "--json", "--dry-run"]);
    expect(lastSpawn().timeout).toBe(120_000);
  });

  it("surfaces the script failure when Anki is unreachable", async () => {
    execFileMock.mockImplementationOnce(
      (
        _file: string,
        _args: string[],
        _options: unknown,
        done: (e: unknown, o: string, s: string) => void,
      ) => {
        done(Object.assign(new Error("exit 1"), { code: 1 }), "", "anki-sync: 连不上 Anki");
      },
    );
    const result = await handleDataRequest({ kind: "cards.sync", dryRun: false });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("script-failed");
      expect(result.error).toContain("连不上 Anki");
    }
  });
});
