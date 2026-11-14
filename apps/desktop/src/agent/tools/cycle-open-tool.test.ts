/**
 * `cycle_open`（`tools/cycle-open-tool.ts`）：参数拼装是纯函数，逐字比对 argv；
 * `execute` 只负责把脚本跑完、把输出交回模型，所以测试注入一个假的 `execFile`
 * （不 spawn 真进程、不依赖 `skills/`）。事务动作（stage/check/commit/abort）
 * 都是 `cycle-open.mjs` 的单步调用。
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { cycleOpenCall, createCycleOpenExtension, type CycleOpenParams } from "./cycle-open-tool.js";
import type { RunExecFile } from "./run-script.js";

const VAULT = "/vault";
const CWD = "/home/learning";
const REPO = "/repo";
const STAGING = "/home/learning/.cycle/C2-20261114-1200";

const OPEN = join("skills", "cycle-plan", "cycle-open.mjs");

describe("cycleOpenCall — 一个动作对应一次脚本调用", () => {
  it("stage 带 cycle：stage <库> <cN> --workspace <工作区> --json", () => {
    expect(cycleOpenCall({ action: "stage", cycle: "C2" }, VAULT, CWD)).toEqual({
      script: OPEN,
      args: ["stage", VAULT, "C2", "--workspace", CWD, "--json"],
    });
  });

  it("check / commit / abort：单步 <action> <staging> --json", () => {
    for (const action of ["check", "commit", "abort"] as const) {
      expect(cycleOpenCall({ action, staging: STAGING }, VAULT, CWD), action).toEqual({
        script: OPEN,
        args: [action, STAGING, "--json"],
      });
    }
  });

  it("缺 cycle、cycle 形状不对、缺 staging 都抛中文错", () => {
    const cases: [CycleOpenParams, RegExp][] = [
      [{ action: "stage" }, /stage 缺少 cycle/],
      [{ action: "stage", cycle: "c2" }, /C 加数字/],
      [{ action: "stage", cycle: "CX" }, /C 加数字/],
      [{ action: "stage", cycle: "../x" }, /C 加数字/],
      [{ action: "check" }, /check 缺少 staging/],
      [{ action: "commit" }, /commit 缺少 staging/],
      [{ action: "abort" }, /abort 缺少 staging/],
    ];
    for (const [params, expected] of cases) {
      expect(() => cycleOpenCall(params, VAULT, CWD), JSON.stringify(params)).toThrow(expected);
    }
  });
});

/** A fake `execFile` that records each call and answers per script. */
interface FakeExec extends RunExecFile {
  calls: { script: string; args: readonly string[]; env: NodeJS.ProcessEnv | undefined }[];
}

function fakeExec(
  answer: (script: string, args: readonly string[]) => { fail?: string } = () => ({}),
): FakeExec {
  const calls: FakeExec["calls"] = [];
  const run: RunExecFile = (file, args, options, callback) => {
    const [script, ...rest] = args as string[];
    calls.push({ script: script ?? "", args: rest, env: options.env });
    const verdict = answer(script ?? "", rest);
    if (verdict.fail === undefined) callback(null, `ok ${script}`, "");
    else callback(new Error(verdict.fail), "", verdict.fail);
  };
  return Object.assign(run, { calls });
}

/** A temp `<home>` holding a `wiki.json` that names `VAULT` (or nothing at all). */
function homeWithVault(vault: string | null): string {
  const home = mkdtempSync(join(tmpdir(), "xuegen-open-home-"));
  if (vault !== null) writeFileSync(join(home, "wiki.json"), JSON.stringify({ root: vault }), "utf8");
  return home;
}

interface CapturedTool {
  execute(
    toolCallId: string,
    params: CycleOpenParams,
    signal?: AbortSignal,
    onUpdate?: undefined,
    ctx?: unknown,
  ): Promise<AgentToolResult<undefined>>;
}

/** Build the extension with a fake exec and capture the registered tool. */
async function tool(exec: RunExecFile | undefined, home: string): Promise<CapturedTool> {
  let captured: CapturedTool | null = null;
  const factory = createCycleOpenExtension({
    repo: REPO,
    home,
    cwd: CWD,
    ...(exec === undefined ? {} : { execFile: exec }),
  });
  // The factory awaits `typebox` before registering, so it must be awaited.
  await factory({
    registerTool(definition: unknown) {
      captured = definition as CapturedTool;
    },
    on() {
      return () => {};
    },
  } as unknown as Parameters<typeof factory>[0]);
  if (captured === null) throw new Error("cycle_open was not registered");
  return captured;
}

describe("cycle_open — execute 跑完脚本，把输出交回模型", () => {
  it("stage 成功 → 普通结果，跑一次 cycle-open.mjs，自动带 --workspace", async () => {
    const home = homeWithVault(VAULT);
    try {
      const exec = fakeExec();
      const result = await (await tool(exec, home)).execute("1", { action: "stage", cycle: "C2" });
      expect(result.isError).toBeUndefined();
      expect(result.content[0]).toEqual({ type: "text", text: `ok ${join(REPO, OPEN)}` });
      expect(exec.calls).toEqual([
        { script: join(REPO, OPEN), args: ["stage", VAULT, "C2", "--workspace", CWD, "--json"], env: expect.anything() },
      ]);
      // 脚本用应用自己的 Node 跑，路径取自 repo。
      expect(exec.calls[0]?.env?.ELECTRON_RUN_AS_NODE).toBe("1");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("check 失败（输出问题清单、退出非 0）→ isError，stdout 原样交回、不抛", async () => {
    const home = homeWithVault(VAULT);
    try {
      const exec = fakeExec((script) =>
        script === join(REPO, OPEN) ? { fail: "wiki/cycles/c2.md：缺少 frontmatter" } : {},
      );
      const result = await (await tool(exec, home)).execute("2", { action: "check", staging: STAGING });
      expect(result.isError).toBe(true);
      expect(exec.calls.map((call) => call.args[0])).toEqual(["check"]);
      expect((result.content[0] as { text: string }).text).toContain("缺少 frontmatter");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("wiki.json 缺失 → 抛中文错且不 spawn", async () => {
    const home = homeWithVault(null);
    try {
      const exec = fakeExec();
      await expect((await tool(exec, home)).execute("3", { action: "stage", cycle: "C2" })).rejects.toThrow(
        /wiki\.json/,
      );
      expect(exec.calls).toHaveLength(0);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
