import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "vitest";
import type { ScriptResult, runScript } from "./scripts.js";
import { lastCheck, runChecks } from "./check.js";

/** `runScript`-shaped fake keyed by script name. */
function fakeRun(responses: Record<string, ScriptResult>): typeof runScript {
  const calls: { name: string; args: string[] }[] = [];
  const run = async (name: string, args: string[]) => {
    calls.push({ name, args });
    const result = responses[name];
    if (!result) throw new Error(`unexpected script ${name}`);
    return result;
  };
  return Object.assign(run, { calls });
}

const LINT = "wiki-save/vault-lint.mjs";
const VERIFY = "course/course-state.mjs";

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "xg-check-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("runChecks", () => {
  it("merges both scripts' problems; where is the slug or a short file name, never a path", async () => {
    const home = tempDir();
    const run = fakeRun({
      [LINT]: {
        ok: true,
        data: { problems: [{ path: "wiki/Bad Dir/", kind: "dir-name", detail: "目录名含空格" }] },
      },
      [VERIFY]: {
        ok: true,
        data: { problems: [{ slug: "epp", kind: "not-readonly", detail: "课程页不是只读（应为只读）" }] },
      },
    });
    const result = await runChecks("/tmp/vault", home, run);
    if (!("checkedAt" in result)) assert.fail("expected a successful CheckResult");
    assert.deepEqual(result, {
      checkedAt: result.checkedAt,
      vault: [{ area: "vault", where: "Bad Dir", kind: "dir-name", detail: "目录名含空格" }],
      courses: [
        { area: "courses", where: "epp", kind: "not-readonly", detail: "课程页不是只读（应为只读）" },
      ],
    });
    for (const problem of [...result.vault, ...result.courses]) {
      assert.ok(problem.where === null || !problem.where.includes("/"), `where 不含 /：${problem.where}`);
    }
    assert.match(result.checkedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual((run as unknown as { calls: { args: string[] }[] }).calls[0]?.args, [
      "/tmp/vault",
      "--json",
    ]);
  });

  it("a global problem (slug/path null) maps to where: null", async () => {
    const home = tempDir();
    const run = fakeRun({
      [LINT]: { ok: true, data: { problems: [] } },
      [VERIFY]: {
        ok: true,
        data: { problems: [{ slug: null, kind: "board-stale", detail: "看板和课程页对不上（过期）" }] },
      },
    });
    const result = await runChecks("/tmp/vault", home, run);
    if (!("checkedAt" in result)) assert.fail("expected a successful CheckResult");
    assert.deepEqual(result.courses, [
      { area: "courses", where: null, kind: "board-stale", detail: "看板和课程页对不上（过期）" },
    ]);
  });

  it("returns the first failure unchanged and writes nothing", async () => {
    const home = tempDir();
    const failure = { ok: false as const, code: "script-failed" as const, error: "boom" };
    const run = fakeRun({
      [LINT]: failure,
      [VERIFY]: { ok: true, data: { problems: [] } },
    });
    const result = await runChecks("/tmp/vault", home, run);
    assert.deepEqual(result, failure);
    assert.equal(lastCheck(home), null, "失败时不写 check-last.json");
  });

  it("persists the result so lastCheck reads the same object back", async () => {
    const home = tempDir();
    const run = fakeRun({
      [LINT]: {
        ok: true,
        data: { problems: [{ path: "index.md", kind: "frontmatter", detail: "缺 frontmatter" }] },
      },
      [VERIFY]: { ok: true, data: { problems: [] } },
    });
    const result = await runChecks("/tmp/vault", home, run);
    if (!("checkedAt" in result)) assert.fail("expected a successful CheckResult");
    assert.deepEqual(lastCheck(home), result);
  });
});

describe("lastCheck", () => {
  it("missing or corrupt file returns null", () => {
    const home = tempDir();
    assert.equal(lastCheck(home), null);
    writeFileSync(join(home, "check-last.json"), "{不是 json", "utf8");
    assert.equal(lastCheck(home), null);
    writeFileSync(join(home, "check-last.json"), JSON.stringify({ checkedAt: 42 }), "utf8");
    assert.equal(lastCheck(home), null);
    readFileSync(join(home, "check-last.json"), "utf8"); // file itself stays untouched
  });
});
