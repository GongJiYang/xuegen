/**
 * `course_plan`（`tools/course-plan-tool.ts`）：参数拼装是纯函数，逐个动作逐字比对
 * argv；`execute` 只负责按顺序把脚本跑完、把输出交回模型，所以它的测试注入一个假的
 * `execFile`（不 spawn 真进程、不依赖 `skills/`）。
 *
 * 这里最要紧的两条：`schedule` 的中间一步失败时，最后一步 `lock` 仍然要跑（课程页
 * 不能留在解锁状态）；`unlock` 失败时后面两步都不该跑（别在没解锁时写文件）。
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

const STATE = join("skills", "course", "course-state.mjs");
const SCHEDULE = join("skills", "course", "course-schedule.mjs");
const BOARD = join("skills", "course", "render-board.mjs");

/** A temp directory shaped like a vault: `wiki/courses` always, `wiki/_generated` on request. */
function vaultWith(dirs: readonly string[]): string {
  const vault = mkdtempSync(join(tmpdir(), "xuegen-plan-tool-"));
  for (const dir of dirs) mkdirSync(join(vault, dir), { recursive: true });
  return vault;
}

describe("coursePlanCalls — 一个动作对应一串脚本调用", () => {
  it("unlock 带 slug：unlock <课程页> <课程目录>", () => {
    expect(coursePlanCalls({ action: "unlock", slug: "ctm" }, VAULT)).toEqual([
      { script: STATE, args: ["unlock", "/vault/wiki/courses/ctm.md", "/vault/wiki/courses"] },
    ]);
  });

  it("unlock 不带 slug：只放开课程目录（新建课程用）", () => {
    expect(coursePlanCalls({ action: "unlock" }, VAULT)).toEqual([
      { script: STATE, args: ["unlock", "/vault/wiki/courses"] },
    ]);
  });

  it("lock：lock <课程页> <课程目录>", () => {
    expect(coursePlanCalls({ action: "lock", slug: "ctm" }, VAULT)).toEqual([
      { script: STATE, args: ["lock", "/vault/wiki/courses/ctm.md", "/vault/wiki/courses"] },
    ]);
  });

  it("schedule 只给必填：unlock → plan --lessons … --write → lock", () => {
    expect(coursePlanCalls({ action: "schedule", slug: "ctm", lessons: "/tmp/lessons.json" }, VAULT)).toEqual(
      [
        { script: STATE, args: ["unlock", "/vault/wiki/courses/ctm.md", "/vault/wiki/courses"] },
        {
          script: SCHEDULE,
          args: ["plan", "/vault/wiki/courses/ctm.md", "--lessons", "/tmp/lessons.json", "--write"],
        },
        { script: STATE, args: ["lock", "/vault/wiki/courses/ctm.md", "/vault/wiki/courses"] },
      ],
    );
  });

  it("schedule 给全参数：标志按 start end rest days extra reviews 的顺序排在 --write 前", () => {
    const params: CoursePlanParams = {
      action: "schedule",
      slug: "ctm",
      lessons: "/tmp/lessons.json",
      start: "2026-11-09",
      end: "2026-12-31",
      rest: "sun",
      days: "mon,wed",
      extra: "2026-11-15",
      reviews: "spaced",
    };
    const calls = coursePlanCalls(params, VAULT);
    expect(calls[1]).toEqual({
      script: SCHEDULE,
      args: [
        "plan",
        "/vault/wiki/courses/ctm.md",
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
        "--write",
      ],
    });
    expect(calls.map((call) => call.script)).toEqual([STATE, SCHEDULE, STATE]);
  });

  it("schedule 只给一部分可选参数：只带上给了的那几个", () => {
    const calls = coursePlanCalls(
      { action: "schedule", slug: "ctm", lessons: "/tmp/l.json", start: "2026-11-09", reviews: "anki" },
      VAULT,
    );
    expect(calls[1]?.args).toEqual([
      "plan",
      "/vault/wiki/courses/ctm.md",
      "--lessons",
      "/tmp/l.json",
      "--start",
      "2026-11-09",
      "--reviews",
      "anki",
      "--write",
    ]);
  });

  it("board 在旧库（没有 wiki/_generated）写到 wiki/ 根", () => {
    const vault = vaultWith([join("wiki"), join("wiki", "courses")]);
    try {
      expect(coursePlanCalls({ action: "board" }, vault)).toEqual([
        {
          script: STATE,
          args: ["dashboard", join(vault, "wiki", "courses"), join(vault, "wiki", "courses.md")],
        },
        { script: BOARD, args: [join(vault, "wiki", "courses"), join(vault, "wiki", "courses.html")] },
      ]);
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }
  });

  it("board 在新库（有 wiki/_generated）写到 wiki/_generated", () => {
    const vault = vaultWith([join("wiki"), join("wiki", "courses"), join("wiki", "_generated")]);
    try {
      expect(coursePlanCalls({ action: "board" }, vault)).toEqual([
        {
          script: STATE,
          args: [
            "dashboard",
            join(vault, "wiki", "courses"),
            join(vault, "wiki", "_generated", "courses.md"),
          ],
        },
        {
          script: BOARD,
          args: [join(vault, "wiki", "courses"), join(vault, "wiki", "_generated", "courses.html")],
        },
      ]);
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }
  });

  it("缺 slug、缺 lessons 抛中文错", () => {
    const cases: [CoursePlanParams, RegExp][] = [
      [{ action: "lock" }, /lock 缺少 slug/],
      [{ action: "schedule" }, /schedule 缺少 slug/],
      [{ action: "schedule", slug: "ctm" }, /schedule 缺少 lessons/],
    ];
    for (const [params, expected] of cases) {
      expect(() => coursePlanCalls(params, VAULT), params.action).toThrow(expected);
    }
  });

  it("slug 含大写、`..`、`/` 都抛中文错（它会成为文件名）", () => {
    for (const slug of ["CTM", "ctm.md", "..", "../x", "a/b", ""]) {
      expect(() => coursePlanCalls({ action: "unlock", slug }, VAULT), slug).toThrow(/slug 只能是/);
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

const SCHEDULE_PARAMS: CoursePlanParams = { action: "schedule", slug: "ctm", lessons: "/tmp/lessons.json" };

describe("course_plan — execute 按顺序跑完脚本，把输出交回模型", () => {
  it("schedule 三步全成功 → 普通结果，三步按 unlock → plan → lock 顺序跑", async () => {
    const home = homeWithVault(VAULT);
    try {
      const exec = fakeExec();
      const result = await (await tool(exec, home)).execute("1", SCHEDULE_PARAMS);
      expect(result.isError).toBeUndefined();
      expect(result.content[0]).toEqual({
        type: "text",
        text: ["ok " + join(REPO, STATE), "ok " + join(REPO, SCHEDULE), "ok " + join(REPO, STATE)].join("\n"),
      });
      expect(exec.calls.map((call) => [call.script, call.args[0]])).toEqual([
        [join(REPO, STATE), "unlock"],
        [join(REPO, SCHEDULE), "plan"],
        [join(REPO, STATE), "lock"],
      ]);
      // 脚本用应用自己的 Node 跑，路径取自 repo。
      expect(exec.calls[0]?.env?.ELECTRON_RUN_AS_NODE).toBe("1");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("schedule 第 2 步（plan）失败 → 第 3 步 lock 仍跑，结果 isError", async () => {
    const home = homeWithVault(VAULT);
    try {
      const exec = fakeExec((script) => (script === join(REPO, SCHEDULE) ? { fail: "排期写入失败" } : {}));
      const result = await (await tool(exec, home)).execute("2", SCHEDULE_PARAMS);
      expect(result.isError).toBe(true);
      expect(exec.calls.map((call) => call.args[0])).toEqual(["unlock", "plan", "lock"]);
      // 失败原因与最后一步的输出都在文本里。
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("排期写入失败");
      expect(text).toContain(`ok ${join(REPO, STATE)}`);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("schedule 第 1 步 unlock 失败 → 后两步都不跑", async () => {
    const home = homeWithVault(VAULT);
    try {
      const exec = fakeExec((script) => (script === join(REPO, STATE) ? { fail: "解锁失败" } : {}));
      const result = await (await tool(exec, home)).execute("3", SCHEDULE_PARAMS);
      expect(result.isError).toBe(true);
      expect(exec.calls.map((call) => call.args[0])).toEqual(["unlock"]);
      expect((result.content[0] as { text: string }).text).toContain("解锁失败");
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
      await expect((await tool(exec, home)).execute("6", { action: "unlock" })).rejects.toThrow(/wiki\.json/);
      expect(exec.calls).toHaveLength(0);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
