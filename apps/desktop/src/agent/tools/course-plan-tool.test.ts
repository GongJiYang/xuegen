/**
 * `course_plan`（`tools/course-plan-tool.ts`）：参数拼装是纯函数，逐个动作逐字比对
 * argv；`execute` 只负责按顺序把脚本跑完、把输出交回模型，所以它的测试注入一个假的
 * `execFile`（不 spawn 真进程、不依赖 `skills/`）。
 *
 * 整理批 1 之后，事务动作（stage/schedule/check/commit/abort）都是
 * `course-close.mjs` 的单步调用——再也没有「失败也要跑完最后一步 lock」的三步序列；
 * 只有 `board` 仍是 dashboard → render-board 两步。
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { coursePlanCalls, createCoursePlanExtension, type CoursePlanParams } from "./course-plan-tool.js";
import type { RunExecFile } from "./run-script.js";

const VAULT = "/vault";
const CWD = "/home/learning";
const REPO = "/repo";
const STAGING = "/home/learning/.close/ctm-20261110-101010";

const CLOSE = join("skills", "course", "course-close.mjs");
const STATE = join("skills", "course", "course-state.mjs");
const BOARD = join("skills", "course", "render-board.mjs");

/** A temp directory shaped like a vault: `wiki/courses` always, `wiki/_generated` on request. */
function vaultWith(dirs: readonly string[]): string {
  const vault = mkdtempSync(join(tmpdir(), "xuegen-plan-tool-"));
  for (const dir of dirs) mkdirSync(join(vault, dir), { recursive: true });
  return vault;
}

describe("coursePlanCalls — 一个动作对应一串脚本调用", () => {
  it("stage 带 slug：stage <库> <slug> --workspace <工作区> --kind plan --json", () => {
    expect(coursePlanCalls({ action: "stage", slug: "ctm" }, VAULT, CWD)).toEqual([
      { script: CLOSE, args: ["stage", VAULT, "ctm", "--workspace", CWD, "--kind", "plan", "--json"] },
    ]);
  });

  it("stage 新建课程（new + subject）：多带 --new --subject", () => {
    expect(coursePlanCalls({ action: "stage", slug: "newc", new: true, subject: "discrete-math" }, VAULT, CWD)).toEqual([
      {
        script: CLOSE,
        args: ["stage", VAULT, "newc", "--workspace", CWD, "--kind", "plan", "--new", "--subject", "discrete-math", "--json"],
      },
    ]);
  });

  it("schedule 只给必填：schedule <暂存> --lessons … --json", () => {
    expect(coursePlanCalls({ action: "schedule", staging: STAGING, lessons: "/tmp/lessons.json" }, VAULT, CWD)).toEqual(
      [{ script: CLOSE, args: ["schedule", STAGING, "--lessons", "/tmp/lessons.json", "--json"] }],
    );
  });

  it("schedule 给全参数：标志按 start end rest days extra reviews 的顺序排在 --json 前", () => {
    const params: CoursePlanParams = {
      action: "schedule",
      staging: STAGING,
      lessons: "/tmp/lessons.json",
      start: "2026-11-09",
      end: "2026-12-31",
      rest: "sun",
      days: "mon,wed",
      extra: "2026-11-15",
      reviews: "spaced",
    };
    expect(coursePlanCalls(params, VAULT, CWD)).toEqual([
      {
        script: CLOSE,
        args: [
          "schedule",
          STAGING,
          "--lessons",
          "/tmp/lessons.json",
          "--start",
          "2026-11-09",
          "--end",
          "2026-12-31",
          "--rest",
          "sun",
          "--days",
          "mon,wed",
          "--extra",
          "2026-11-15",
          "--reviews",
          "spaced",
          "--json",
        ],
      },
    ]);
  });

  it("schedule 只给一部分可选参数：只带上给了的那几个", () => {
    const calls = coursePlanCalls(
      { action: "schedule", staging: STAGING, lessons: "/tmp/l.json", start: "2026-11-09", reviews: "anki" },
      VAULT,
      CWD,
    );
    expect(calls[0]?.args).toEqual([
      "schedule",
      STAGING,
      "--lessons",
      "/tmp/l.json",
      "--start",
      "2026-11-09",
      "--reviews",
      "anki",
      "--json",
    ]);
  });

  it("check / commit / abort：单步 <action> <staging> --json", () => {
    for (const action of ["check", "commit", "abort"] as const) {
      expect(coursePlanCalls({ action, staging: STAGING }, VAULT, CWD), action).toEqual([
        { script: CLOSE, args: [action, STAGING, "--json"] },
      ]);
    }
  });

  it("board 写到 wiki/_generated（目录不存在也一样）", () => {
    const vault = vaultWith([join("wiki"), join("wiki", "courses")]);
    expect(coursePlanCalls({ action: "board" }, vault, "/ws")).toEqual([
      {
        script: STATE,
        args: ["dashboard", join(vault, "wiki", "courses"), join(vault, "wiki", "_generated", "courses.md")],
      },
      {
        script: BOARD,
        args: [join(vault, "wiki", "courses"), join(vault, "wiki", "_generated", "courses.html")],
      },
    ]);
  });

  it("缺 slug、缺 staging、缺 lessons、new 缺 subject、subject 不带 new 都抛中文错", () => {
    const cases: [CoursePlanParams, RegExp][] = [
      [{ action: "stage" }, /stage 缺少 slug/],
      [{ action: "stage", slug: "newc", new: true }, /缺少 subject/],
      [{ action: "stage", slug: "ctm", subject: "x" }, /只在新建课程/],
      [{ action: "schedule", staging: STAGING }, /schedule 缺少 lessons/],
      [{ action: "check" }, /check 缺少 staging/],
      [{ action: "commit" }, /commit 缺少 staging/],
      [{ action: "abort" }, /abort 缺少 staging/],
      [{ action: "schedule", lessons: "/tmp/l.json" }, /schedule 缺少 staging/],
    ];
    for (const [params, expected] of cases) {
      expect(() => coursePlanCalls(params, VAULT, CWD), params.action).toThrow(expected);
    }
  });

  it("slug / subject 含大写、`..`、`/` 都抛中文错（它们会成为文件名）", () => {
    for (const slug of ["CTM", "ctm.md", "..", "../x", "a/b", ""]) {
      expect(() => coursePlanCalls({ action: "stage", slug }, VAULT, CWD), slug).toThrow(/slug 只能是/);
    }
    for (const subject of ["离散", "a/b", "..", "A-b"]) {
      expect(() => coursePlanCalls({ action: "stage", slug: "newc", new: true, subject }, VAULT, CWD), subject).toThrow(
        /subject 只能是/,
      );
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
  const home = mkdtempSync(join(tmpdir(), "xuegen-plan-home-"));
  if (vault !== null) writeFileSync(join(home, "wiki.json"), JSON.stringify({ root: vault }), "utf8");
  return home;
}

interface CapturedTool {
  execute(
    toolCallId: string,
    params: CoursePlanParams,
    signal?: AbortSignal,
    onUpdate?: undefined,
    ctx?: unknown,
  ): Promise<AgentToolResult<undefined>>;
}

/** Build the extension with a fake exec and capture the registered tool. */
async function tool(exec: RunExecFile, home: string): Promise<CapturedTool> {
  let captured: CapturedTool | null = null;
  const factory = createCoursePlanExtension({ repo: REPO, home, cwd: CWD, execFile: exec });
  // The factory awaits `typebox` before registering, so it must be awaited.
  await factory({
    registerTool(definition: unknown) {
      captured = definition as CapturedTool;
    },
    on() {
      return () => {};
    },
  } as unknown as Parameters<typeof factory>[0]);
  if (captured === null) throw new Error("course_plan was not registered");
  return captured;
}

const STAGE_PARAMS: CoursePlanParams = { action: "stage", slug: "ctm" };

describe("course_plan — execute 按顺序跑完脚本，把输出交回模型", () => {
  it("stage 一步成功 → 普通结果，跑一次 course-close.mjs", async () => {
    const home = homeWithVault(VAULT);
    try {
      const exec = fakeExec();
      const result = await (await tool(exec, home)).execute("1", STAGE_PARAMS);
      expect(result.isError).toBeUndefined();
      expect(result.content[0]).toEqual({ type: "text", text: `ok ${join(REPO, CLOSE)}` });
      expect(exec.calls.map((call) => [call.script, call.args[0]])).toEqual([[join(REPO, CLOSE), "stage"]]);
      // 脚本用应用自己的 Node 跑，路径取自 repo。
      expect(exec.calls[0]?.env?.ELECTRON_RUN_AS_NODE).toBe("1");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("check 失败（check 输出问题清单、退出非 0）→ isError，stdout 原样交回", async () => {
    const home = homeWithVault(VAULT);
    try {
      const exec = fakeExec((script) => (script === join(REPO, CLOSE) ? { fail: "排期失败：课次多于上课日" } : {}));
      const result = await (await tool(exec, home)).execute("2", { action: "check", staging: STAGING });
      expect(result.isError).toBe(true);
      expect(exec.calls.map((call) => call.args[0])).toEqual(["check"]);
      expect((result.content[0] as { text: string }).text).toContain("课次多于上课日");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("board 第 1 步（dashboard）失败 → 第 2 步 render-board 不跑", async () => {
    const vault = vaultWith([join("wiki"), join("wiki", "courses")]);
    const home = homeWithVault(vault);
    try {
      const exec = fakeExec((script) => (script === join(REPO, STATE) ? { fail: "看板生成失败" } : {}));
      const result = await (await tool(exec, home)).execute("4", { action: "board" });
      expect(result.isError).toBe(true);
      expect(exec.calls.map((call) => call.script)).toEqual([join(REPO, STATE)]);
      expect((result.content[0] as { text: string }).text).toContain("看板生成失败");
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(vault, { recursive: true, force: true });
    }
  });

  it("board 两步全成功 → 普通结果", async () => {
    const vault = vaultWith([join("wiki"), join("wiki", "courses")]);
    const home = homeWithVault(vault);
    try {
      const exec = fakeExec();
      const result = await (await tool(exec, home)).execute("5", { action: "board" });
      expect(result.isError).toBeUndefined();
      expect(exec.calls.map((call) => call.script)).toEqual([join(REPO, STATE), join(REPO, BOARD)]);
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(vault, { recursive: true, force: true });
    }
  });

  it("wiki.json 缺失 → 抛中文错且不 spawn", async () => {
    const home = homeWithVault(null);
    try {
      const exec = fakeExec();
      await expect((await tool(exec, home)).execute("6", STAGE_PARAMS)).rejects.toThrow(/wiki\.json/);
      expect(exec.calls).toHaveLength(0);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
