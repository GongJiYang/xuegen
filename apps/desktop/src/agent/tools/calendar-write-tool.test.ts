// @vitest-environment node
/**
 * `calendar_write`（`tools/calendar-write-tool.ts`，阶段 4a-i2 / 4a-2 回归）。
 *
 * 两道检查分开测：
 *
 * - 参数拼装是纯函数，argv 逐字比对（`write <vault> <date> --text <text>`），
 *   包括「空正文 = 删除那天笔记」这一条（空字符串不能被当成缺参数）。
 * - `execute` 只负责把脚本的输出交回模型，所以注入假 `execFile`（不 spawn 真
 *   进程、不依赖 `skills/`），按退出码分两条路径。
 *
 * 为什么这个工具存在：`wiki/calendar/` 在沙盒 denyWrite 里，bash 写不了；记日历
 * 只能走这个在沙盒外跑脚本的工具（与 `course_close` 同一模式）。
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { calendarWriteArgs, createCalendarWriteExtension } from "./calendar-write-tool.js";
import type { RunExecFile } from "./run-script.js";

const VAULT = "/vault";
const REPO = "/repo";

const SCRIPT = join("skills", "calendar", "calendar.mjs");

type Params = Parameters<typeof calendarWriteArgs>[0];

describe("calendarWriteArgs — argv 逐字", () => {
  it("write 传 vault、日期与 --text", () => {
    expect(
      calendarWriteArgs({ date: "2026-11-05", text: "周五：复习 BA，看 Stachniss 视频" }, VAULT),
    ).toEqual(["write", "/vault", "2026-11-05", "--text", "周五：复习 BA，看 Stachniss 视频"]);
  });

  it("空 text 照样拼出来（空正文 = 删除那天的笔记，不是缺参数）", () => {
    expect(calendarWriteArgs({ date: "2026-11-05", text: "" }, VAULT)).toEqual([
      "write",
      "/vault",
      "2026-11-05",
      "--text",
      "",
    ]);
  });

  it("多行 text 原样进 argv（换行不被压平，脚本按正文写文件）", () => {
    const text = "第一行\n第二行\n";
    expect(calendarWriteArgs({ date: "2026-12-01", text }, VAULT)).toEqual([
      "write",
      "/vault",
      "2026-12-01",
      "--text",
      text,
    ]);
  });

  it("date 缺失或格式不对时抛中文错，指明格式", () => {
    const cases: [Params, RegExp][] = [
      [{ text: "x" }, /缺少 date/],
      [{ date: "", text: "x" }, /缺少 date/],
      [{ date: "2026-11", text: "x" }, /缺少 date/],
      [{ date: "2026/11/05", text: "x" }, /缺少 date/],
      [{ date: "20261105", text: "x" }, /缺少 date/],
      [{ date: 20261105 as unknown as string, text: "x" }, /缺少 date/],
    ];
    for (const [params, expected] of cases) {
      expect(() => calendarWriteArgs(params, VAULT), JSON.stringify(params)).toThrow(expected);
      expect(() => calendarWriteArgs(params, VAULT), JSON.stringify(params)).toThrow(/YYYY-MM-DD/);
    }
  });

  it("date 形状对但不可能（2026-02-30）交给脚本自己拒，工具不越权", () => {
    // 工具只查形状：更严格的日期校验在 `skills/calendar/calendar.mjs` 里，两边都不写重。
    expect(calendarWriteArgs({ date: "2026-02-30", text: "x" }, VAULT)).toContain("2026-02-30");
  });

  it("text 缺失（不是空字符串）时抛中文错，说明空字符串才是删除", () => {
    expect(() => calendarWriteArgs({ date: "2026-11-05" }, VAULT)).toThrow(/缺少 text/);
    expect(() => calendarWriteArgs({ date: "2026-11-05" }, VAULT)).toThrow(/空字符串/);
    expect(() => calendarWriteArgs({ date: "2026-11-05", text: undefined }, VAULT)).toThrow(/缺少 text/);
    expect(() => calendarWriteArgs({ date: "2026-11-05", text: 3 as unknown as string }, VAULT)).toThrow(
      /缺少 text/,
    );
  });
});

/** 假 `execFile`：记录调用，回放一个固定的结果。 */
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

/** 临时 `<home>`：写 `wiki.json` 指到 `vault`；传 null 表示没有库。 */
function homeWithVault(vault: string | null): string {
  const home = mkdtempSync(join(tmpdir(), "xuegen-calendar-tool-"));
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

async function tool(exec: RunExecFile, home: string, repo = REPO): Promise<CapturedTool> {
  let captured: CapturedTool | null = null;
  const factory = createCalendarWriteExtension({ repo, home, execFile: exec });
  // 工厂先 await typebox 再注册，必须 await。
  await factory({
    registerTool(definition: unknown) {
      captured = definition as CapturedTool;
    },
    on() {
      return () => {};
    },
  } as unknown as Parameters<typeof factory>[0]);
  if (captured === null) throw new Error("calendar_write was not registered");
  return captured;
}

describe("calendar_write — execute 把脚本输出交回模型", () => {
  it("退出码 0：script 的 stdout 原样返回，工具不算错误", async () => {
    const home = homeWithVault(VAULT);
    try {
      const text = "已写入 wiki/calendar/2026-11-05.md\n";
      const exec = fakeExec({ stdout: text });
      const result = await (await tool(exec, home)).execute("1", { date: "2026-11-05", text: "复习 BA" });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]).toEqual({ type: "text", text });
      // 脚本用应用自己的 Node 在沙盒外跑，路径取自 repo（与 course_close 同一模式）。
      const [call] = exec.calls;
      expect(call?.file).toBe(process.execPath);
      expect(call?.args[0]).toBe(join(REPO, SCRIPT));
      expect(call?.args.slice(1)).toEqual(calendarWriteArgs({ date: "2026-11-05", text: "复习 BA" }, VAULT));
      expect(call?.env?.ELECTRON_RUN_AS_NODE).toBe("1");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("空 text（删除那天）也跑同样的 argv，脚本的确认照原样交回", async () => {
    const home = homeWithVault(VAULT);
    try {
      const exec = fakeExec({ stdout: "已删除 wiki/calendar/2026-11-05.md\n" });
      const result = await (await tool(exec, home)).execute("2", { date: "2026-11-05", text: "" });
      expect(result.isError).toBeUndefined();
      expect(exec.calls[0]?.args.slice(1)).toEqual(["write", VAULT, "2026-11-05", "--text", ""]);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("退出码非 0：标记 isError，stderr 交给模型（脚本自己说的失败原因优先）", async () => {
    const home = homeWithVault(VAULT);
    try {
      const exec = fakeExec({
        error: new Error("Command failed: exit code 1"),
        stdout: "",
        stderr: "calendar: 不是有效日期：2026-02-30\n",
      });
      const result = await (await tool(exec, home)).execute("3", { date: "2026-02-30", text: "x" });
      expect(result.isError).toBe(true);
      expect(result.content[0]).toEqual({ type: "text", text: "calendar: 不是有效日期：2026-02-30\n" });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("退出码非 0 且什么都没打印时，退回错误消息本身", async () => {
    const home = homeWithVault(VAULT);
    try {
      const exec = fakeExec({ error: new Error("spawn 失败") });
      const result = await (await tool(exec, home)).execute("4", { date: "2026-11-05", text: "x" });
      expect(result.isError).toBe(true);
      expect(result.content[0]).toEqual({ type: "text", text: "spawn 失败" });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("没有库（wiki.json 缺失）时抛中文错，不跑脚本", async () => {
    const home = homeWithVault(null);
    try {
      const exec = fakeExec({ stdout: "不该出现" });
      await expect((await tool(exec, home)).execute("5", { date: "2026-11-05", text: "x" })).rejects.toThrow(
        /读不到库的位置/,
      );
      expect(exec.calls).toEqual([]);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("date 格式不对时在跑脚本之前就抛中文错", async () => {
    const home = homeWithVault(VAULT);
    try {
      const exec = fakeExec({ stdout: "不该出现" });
      await expect((await tool(exec, home)).execute("6", { date: "11/05", text: "x" })).rejects.toThrow(
        /缺少 date/,
      );
      expect(exec.calls).toEqual([]);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("calendar_write — 缺库与缺参数的分工", () => {
  it("库的位置从 `<home>/wiki.json` 读（工具不带 vault 参数）", async () => {
    const otherVault = "/Users/someone/Wiki";
    const home = homeWithVault(otherVault);
    try {
      const exec = fakeExec({ stdout: "ok\n" });
      await (await tool(exec, home)).execute("7", { date: "2027-01-01", text: "元旦" });
      expect(exec.calls[0]?.args.slice(1)).toEqual(["write", otherVault, "2027-01-01", "--text", "元旦"]);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("`wiki.json` 里的 root 是空串时同样报读不到库", async () => {
    const home = mkdtempSync(join(tmpdir(), "xuegen-calendar-tool-"));
    try {
      writeFileSync(join(home, "wiki.json"), JSON.stringify({ root: "   " }), "utf8");
      const exec = fakeExec({ stdout: "不该出现" });
      await expect((await tool(exec, home)).execute("8", { date: "2026-11-05", text: "x" })).rejects.toThrow(
        /读不到库的位置/,
      );
      expect(exec.calls).toEqual([]);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
