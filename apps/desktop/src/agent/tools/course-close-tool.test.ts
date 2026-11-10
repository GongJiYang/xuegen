/**
 * `course_close`（`tools/course-close-tool.ts`）：参数拼装是纯函数，逐个动作测
 * argv；`execute` 只负责把脚本的 stdout 交回模型，所以它的测试注入一个假的
 * `execFile`（不 spawn 真进程、不依赖 `skills/`）。
 *
 * 退出码语义照 `skills/course/course-close.mjs`：`check` 失败时以非 0 退出，但
 * problems 的 JSON 仍在 stdout 上——这条是这里最要紧的断言（失败原因要能被模型
 * 读到，而不是只看到一句 "Command failed"）。
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import {
  courseCloseArgs,
  createCourseCloseExtension,
  type CloseAction,
  type RunExecFile,
} from "./course-close-tool.js";

const VAULT = "/vault";
const CWD = "/home/learning";

type Params = Parameters<typeof courseCloseArgs>[0];

/** The six actions with just enough parameters to be complete. */
const COMPLETE: Record<CloseAction, Params> = {
  stage: { action: "stage", slug: "discrete-math-epp" },
  add: {
    action: "add",
    staging: "/home/learning/.close/discrete-math-epp-1",
    path: "wiki/知识/concepts/x.md",
  },
  check: { action: "check", staging: "/home/learning/.close/discrete-math-epp-1" },
  commit: { action: "commit", staging: "/home/learning/.close/discrete-math-epp-1" },
  abort: { action: "abort", staging: "/home/learning/.close/discrete-math-epp-1" },
  shift: { action: "shift", slug: "discrete-math-epp" },
  undo: { action: "undo", slug: "discrete-math-epp" },
  snapshot: {
    action: "snapshot",
    staging: "/home/learning/.close/discrete-math-epp-1",
    report: ".snapshot.json",
    out: "wiki/courses/discrete-math-epp/snapshots/2026-11-10-01.png",
  },
};

describe("courseCloseArgs — 一个动作一条 argv", () => {
  it("snapshot passes the staging, the report and the png (in that order), with --json", () => {
    expect(courseCloseArgs(COMPLETE.snapshot, VAULT, CWD)).toEqual([
      "snapshot",
      "/home/learning/.close/discrete-math-epp-1",
      ".snapshot.json",
      "wiki/courses/discrete-math-epp/snapshots/2026-11-10-01.png",
      "--json",
    ]);
  });

  it("stage passes the vault, the slug and --workspace, always with --json", () => {
    expect(courseCloseArgs(COMPLETE.stage, VAULT, CWD)).toEqual([
      "stage",
      VAULT,
      "discrete-math-epp",
      "--workspace",
      CWD,
      "--json",
    ]);
  });

  it("add passes the staging directory and the in-vault relative path", () => {
    expect(courseCloseArgs(COMPLETE.add, VAULT, CWD)).toEqual([
      "add",
      "/home/learning/.close/discrete-math-epp-1",
      "wiki/知识/concepts/x.md",
      "--json",
    ]);
  });

  it("check passes the staging directory", () => {
    expect(courseCloseArgs(COMPLETE.check, VAULT, CWD)).toEqual([
      "check",
      "/home/learning/.close/discrete-math-epp-1",
      "--json",
    ]);
  });

  it("commit passes the staging directory", () => {
    expect(courseCloseArgs(COMPLETE.commit, VAULT, CWD)).toEqual([
      "commit",
      "/home/learning/.close/discrete-math-epp-1",
      "--json",
    ]);
  });

  it("commit passes --label 存档点 before --json", () => {
    expect(
      courseCloseArgs(
        { action: "commit", staging: "/home/learning/.close/discrete-math-epp-1", label: "存档点" },
        VAULT,
        CWD,
      ),
    ).toEqual(["commit", "/home/learning/.close/discrete-math-epp-1", "--label", "存档点", "--json"]);
  });

  it("commit passes --label 收课 before --json", () => {
    expect(
      courseCloseArgs(
        { action: "commit", staging: "/home/learning/.close/discrete-math-epp-1", label: "收课" },
        VAULT,
        CWD,
      ),
    ).toEqual(["commit", "/home/learning/.close/discrete-math-epp-1", "--label", "收课", "--json"]);
  });

  it("label is ignored by actions other than commit", () => {
    expect(
      courseCloseArgs(
        { action: "check", staging: "/home/learning/.close/discrete-math-epp-1", label: "存档点" },
        VAULT,
        CWD,
      ),
    ).toEqual(["check", "/home/learning/.close/discrete-math-epp-1", "--json"]);
  });

  it("abort passes the staging directory", () => {
    expect(courseCloseArgs(COMPLETE.abort, VAULT, CWD)).toEqual([
      "abort",
      "/home/learning/.close/discrete-math-epp-1",
      "--json",
    ]);
  });

  it("undo passes the vault, the slug and --workspace", () => {
    expect(courseCloseArgs(COMPLETE.undo, VAULT, CWD)).toEqual([
      "undo",
      VAULT,
      "discrete-math-epp",
      "--workspace",
      CWD,
      "--json",
    ]);
  });

  it("shift passes only the slug when no dates are given", () => {
    expect(courseCloseArgs({ action: "shift", slug: "discrete-math-epp" }, VAULT, CWD)).toEqual([
      "shift",
      VAULT,
      "discrete-math-epp",
      "--workspace",
      CWD,
      "--json",
    ]);
  });

  it("shift passes --today when today is given", () => {
    expect(
      courseCloseArgs({ action: "shift", slug: "discrete-math-epp", today: "2026-11-10" }, VAULT, CWD),
    ).toEqual([
      "shift",
      VAULT,
      "discrete-math-epp",
      "--workspace",
      CWD,
      "--today",
      "2026-11-10",
      "--json",
    ]);
  });

  it("shift passes --today and --end in that order when both are given", () => {
    expect(
      courseCloseArgs(
        { action: "shift", slug: "discrete-math-epp", today: "2026-11-10", end: "2026-12-24" },
        VAULT,
        CWD,
      ),
    ).toEqual([
      "shift",
      VAULT,
      "discrete-math-epp",
      "--workspace",
      CWD,
      "--today",
      "2026-11-10",
      "--end",
      "2026-12-24",
      "--json",
    ]);
  });

  it("throws a Chinese error naming the missing field", () => {
    const cases: [Params, RegExp][] = [
      [{ action: "stage" }, /stage 缺少 slug/],
      [{ action: "undo" }, /undo 缺少 slug/],
      [{ action: "add" }, /add 缺少 staging/],
      [{ action: "add", staging: "/home/learning/.close/discrete-math-epp-1" }, /add 缺少 path/],
      [{ action: "check" }, /check 缺少 staging/],
      [{ action: "commit" }, /commit 缺少 staging/],
      [{ action: "abort" }, /abort 缺少 staging/],
      [{ action: "shift" }, /shift 缺少 slug/],
      [{ action: "snapshot" }, /snapshot 缺少 staging/],
      [{ action: "snapshot", staging: "/s" }, /snapshot 缺少 report/],
      [{ action: "snapshot", staging: "/s", report: ".snapshot.json" }, /snapshot 缺少 out/],
    ];
    for (const [params, expected] of cases) {
      expect(() => courseCloseArgs(params, VAULT, CWD), params.action).toThrow(expected);
    }
  });
});

/** A fake `execFile` that records its call and replays one canned outcome. */
function fakeExec(outcome: {
  error?: Error | null;
  stdout?: string;
  stderr?: string;
}): RunExecFile & { calls: { file: string; args: readonly string[]; env: NodeJS.ProcessEnv | undefined }[] } {
  const calls: { file: string; args: readonly string[]; env: NodeJS.ProcessEnv | undefined }[] = [];
  const run: RunExecFile = (file, args, options, callback) => {
    calls.push({ file, args, env: options.env });
    callback(outcome.error ?? null, outcome.stdout ?? "", outcome.stderr ?? "");
  };
  return Object.assign(run, { calls });
}

/** A temp `<home>` holding a `wiki.json` that names `VAULT`. */
function homeWithVault(vault: string | null): string {
  const home = mkdtempSync(join(tmpdir(), "xuegen-close-tool-"));
  if (vault !== null) writeFileSync(join(home, "wiki.json"), JSON.stringify({ root: vault }), "utf8");
  return home;
}

interface CapturedTool {
  execute(
    toolCallId: string,
    params: Params,
    signal?: AbortSignal,
    onUpdate?: undefined,
    ctx?: unknown,
  ): Promise<AgentToolResult<undefined>>;
}

/** Build the extension with a fake exec and capture the registered tool. */
async function tool(exec: RunExecFile, home: string, repo = "/repo"): Promise<CapturedTool> {
  let captured: CapturedTool | null = null;
  const factory = createCourseCloseExtension({ repo, home, cwd: CWD, execFile: exec });
  // The factory awaits `typebox` before registering, so it must be awaited.
  await factory({
    registerTool(definition: unknown) {
      captured = definition as CapturedTool;
    },
    on() {
      return () => {};
    },
  } as unknown as Parameters<typeof factory>[0]);
  if (captured === null) throw new Error("course_close was not registered");
  return captured;
}

describe("course_close — execute 把脚本输出交回模型", () => {
  it("returns stdout as an ordinary result when the script exits 0", async () => {
    const home = homeWithVault(VAULT);
    try {
      const exec = fakeExec({ stdout: '{"ok":true,"staging":"/home/learning/.close/x-1"}\n' });
      const result = await (await tool(exec, home)).execute("1", COMPLETE.stage);
      expect(result.isError).toBeUndefined();
      expect(result.content[0]).toEqual({
        type: "text",
        text: '{"ok":true,"staging":"/home/learning/.close/x-1"}\n',
      });
      // 脚本用应用自己的 Node 跑（与 main/data/scripts.ts 同一模式），路径取自 repo。
      const [call] = exec.calls;
      expect(call?.file).toBe(process.execPath);
      expect(call?.args[0]).toBe("/repo/skills/course/course-close.mjs");
      expect(call?.args.slice(1)).toEqual(courseCloseArgs(COMPLETE.stage, VAULT, CWD));
      expect(call?.env?.ELECTRON_RUN_AS_NODE).toBe("1");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("keeps a failed check's problems (stdout) and marks the result as an error", async () => {
    const home = homeWithVault(VAULT);
    try {
      const problems = '{"ok":false,"problems":[{"code":"missing-link","page":"wiki/知识/concepts/x.md"}]}';
      const exec = fakeExec({
        error: new Error("Command failed: exit code 1"),
        stdout: problems,
        stderr: "noise",
      });
      const result = await (await tool(exec, home)).execute("2", COMPLETE.check);
      expect(result.isError).toBe(true);
      // stdout 优先：check 的 problems 就是模型要读的失败原因。
      expect(result.content[0]).toEqual({ type: "text", text: problems });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("falls back to stderr, then the error message, when nothing was printed", async () => {
    const home = homeWithVault(VAULT);
    try {
      const withStderr = await (
        await tool(fakeExec({ error: new Error("boom"), stderr: "脚本崩了\n" }), home)
      ).execute("3", COMPLETE.commit);
      expect(withStderr.isError).toBe(true);
      expect(withStderr.content[0]).toEqual({ type: "text", text: "脚本崩了\n" });

      const bare = await (
        await tool(fakeExec({ error: new Error("boom") }), home)
      ).execute("4", COMPLETE.abort);
      expect(bare.isError).toBe(true);
      expect(bare.content[0]).toEqual({ type: "text", text: "boom" });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("refuses to run without a configured vault", async () => {
    const home = homeWithVault(null);
    try {
      const exec = fakeExec({ stdout: "{}" });
      await expect((await tool(exec, home)).execute("5", COMPLETE.stage)).rejects.toThrow(/wiki\.json/);
      expect(exec.calls).toHaveLength(0);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
