/**
 * The tool guard extension: blocking returns a reason, an allowed call gets its
 * `input.path` rewritten to the checked resolution, and every decision lands in
 * the audit log.
 *
 * A fake Pi API captures the `tool_call` / `tool_result` handlers, so this tests
 * the extension's own contract without a session or an SDK import at runtime.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SessionRole } from "../../shared/protocol.js";
import { createGuardExtension, type GuardOptions } from "./extension.js";
import type { AuditEntry } from "./audit.js";
import type { PathFacts } from "./path.js";
import type { Roots } from "./roles.js";
import type { SandboxRunner } from "../sandbox/runner.js";

const temporary: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "xuegen-guard-ext-"));
  temporary.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface ToolCallEvent {
  type: "tool_call";
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
}

/** `PathFacts` over a fixed table of existing paths, no disk access. */
function fakeFacts(existing: readonly string[], caseInsensitive = true): PathFacts {
  return {
    realpath(path) {
      if (!existing.includes(path)) {
        const error = new Error(`ENOENT: ${path}`) as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      }
      return path;
    },
    caseInsensitive: () => caseInsensitive,
  };
}

interface ToolResultEvent {
  type: "tool_result";
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[];
  isError: boolean;
}

interface Harness {
  call(event: ToolCallEvent): unknown;
  /** The `tool_result` handler's verdict (undefined when it leaves the result alone). */
  result(event: ToolResultEvent): { content?: { type: string; text?: string }[] } | undefined;
  audit: () => AuditEntry[];
}

/** Build the extension and capture its `tool_call` / `tool_result` handlers. */
function harness(options: Omit<GuardOptions, "role" | "sessionId">, role: SessionRole = { kind: "free" }): Harness {
  let handler: ((event: ToolCallEvent) => unknown) | null = null;
  let resultHandler: ((event: ToolResultEvent) => { content?: { type: string; text?: string }[] } | undefined) | null =
    null;
  const factory = createGuardExtension({ ...options, role: () => role, sessionId: () => "session-1" });
  factory({
    on(name: string, callback: (event: ToolCallEvent) => unknown) {
      if (name === "tool_call") handler = callback;
      if (name === "tool_result") {
        resultHandler = callback as unknown as (event: ToolResultEvent) => { content?: { type: string; text?: string }[] };
      }
      return () => {};
    },
  } as unknown as Parameters<typeof factory>[0]);
  return {
    call(event) {
      if (!handler) throw new Error("tool_call handler was not registered");
      return handler(event);
    },
    result(event) {
      if (!resultHandler) throw new Error("tool_result handler was not registered");
      return resultHandler(event);
    },
    audit() {
      try {
        return readFileSync(join(options.home, "guard.log"), "utf8")
          .trim()
          .split("\n")
          .filter((line) => line !== "")
          .map((line) => JSON.parse(line) as AuditEntry);
      } catch {
        return [];
      }
    },
  };
}

const home = "/tmp/fake-home";
const roots: Roots = { vault: "/vault", workspace: "/home/learning", home, repo: "/repo" };
const existing = ["/vault", "/vault/wiki", "/vault/wiki/courses", "/vault/wiki/courses/ctm.md", "/home/learning"];

function options(overrides: Partial<GuardOptions> = {}): Omit<GuardOptions, "role" | "sessionId"> {
  const dir = tempDir();
  return {
    roots,
    home: dir,
    cwd: "/vault",
    facts: fakeFacts(existing),
    exists: () => false,
    ...overrides,
  };
}

describe("createGuardExtension", () => {
  it("blocks a denied call with a Chinese reason and audits it", () => {
    const guard = harness(options());
    const event: ToolCallEvent = {
      type: "tool_call",
      toolCallId: "1",
      toolName: "write",
      input: { path: "/vault/wiki/courses/ctm.md", content: "x" },
    };
    const result = guard.call(event) as { block?: boolean; reason?: string } | undefined;

    expect(result?.block).toBe(true);
    expect(result?.reason).toContain("自由会话");
    // A blocked call keeps its input untouched.
    expect(event.input.path).toBe("/vault/wiki/courses/ctm.md");
    expect(guard.audit()).toHaveLength(1);
    expect(guard.audit()[0]?.allow).toBe(false);
  });

  it("rewrites an allowed path to the resolved absolute form (no second lookup)", () => {
    const guard = harness(options({ facts: fakeFacts(existing, false) }));
    const event: ToolCallEvent = {
      type: "tool_call",
      toolCallId: "2",
      toolName: "read",
      input: { path: "wiki/courses/CTM.md" },
    };
    const result = guard.call(event);

    expect(result).toBeUndefined();
    // Case is kept (the volume is treated as case-sensitive here); only resolution happened.
    expect(event.input.path).toBe("/vault/wiki/courses/CTM.md");
    expect(guard.audit()[0]?.allow).toBe(true);
  });

  it("audits a blocked call with the canonical path and the fail-closed reason on an internal error", () => {
    const guard = harness(
      options({
        facts: {
          realpath() {
            throw new Error("boom");
          },
          caseInsensitive: () => false,
        },
      }),
    );
    const event: ToolCallEvent = {
      type: "tool_call",
      toolCallId: "3",
      toolName: "edit",
      input: { path: "/vault/wiki/courses/ctm.md" },
    };
    const result = guard.call(event) as { block?: boolean; reason?: string } | undefined;

    expect(result?.block).toBe(true);
    expect(result?.reason).toContain("权限检查内部出错");
    expect(guard.audit()).toHaveLength(1);
  });

  it("audits and passes through a tool the lists do not cover (MCP)", () => {
    const guard = harness(options());
    const event: ToolCallEvent = {
      type: "tool_call",
      toolCallId: "4",
      toolName: "mcp__obsidian__search",
      input: { query: "closure" },
    };
    expect(guard.call(event)).toBeUndefined();
    const [entry] = guard.audit();
    expect(entry?.tool).toBe("mcp__obsidian__search");
    expect(entry?.allow).toBe(true);
    expect(entry?.reason).toContain("默认放行");
  });

  it("sends a new clip through, but refuses overwriting an existing one", () => {
    const fresh = harness(options({ exists: () => false }));
    const newClip: ToolCallEvent = {
      type: "tool_call",
      toolCallId: "5",
      toolName: "write",
      input: { path: "/vault/clippings/新文章.md", content: "x" },
    };
    expect(fresh.call(newClip)).toBeUndefined();

    const existingClip = harness(options({ exists: () => true }));
    const overwrite: ToolCallEvent = {
      type: "tool_call",
      toolCallId: "6",
      toolName: "write",
      input: { path: "/vault/clippings/已有.md", content: "x" },
    };
    const result = existingClip.call(overwrite) as { block?: boolean } | undefined;
    expect(result?.block).toBe(true);
  });

  it("reads the role lazily, so a role that settles after registration is honoured", () => {    const dir = tempDir();
    let role: SessionRole = { kind: "free" };
    let handler: ((event: ToolCallEvent) => unknown) | null = null;
    const factory = createGuardExtension({
      roots,
      home: dir,
      cwd: "/vault",
      facts: fakeFacts(existing),
      exists: () => false,
      role: () => role,
      sessionId: () => "session-1",
    });
    factory({
      on(_name: string, callback: (event: ToolCallEvent) => unknown) {
        handler = callback;
        return () => {};
      },
    } as unknown as Parameters<typeof factory>[0]);

    // 周期页：自由会话拒、总控放行（课程页整理 1 起两个角色都拒，不能用它做这条用例）。
    const write = (): unknown =>
      handler?.({ type: "tool_call", toolCallId: "7", toolName: "write", input: { path: "/vault/wiki/cycles/c2.md" } });

    expect((write() as { block?: boolean } | undefined)?.block).toBe(true);
    role = { kind: "control" };
    expect(write()).toBeUndefined();
  });

  it("expands a leading `~` before checking, so a credential path cannot slip through", () => {
    const guard = harness(options());
    const event: ToolCallEvent = {
      type: "tool_call",
      toolCallId: "8",
      toolName: "read",
      input: { path: "~/.ssh/id_ed25519" },
    };
    const result = guard.call(event) as { block?: boolean; reason?: string } | undefined;

    expect(result?.block).toBe(true);
    expect(result?.reason).toContain("凭据");
    // The audit line names the expanded path, not the `~` spelling.
    expect(guard.audit()[0]?.target).toContain("/.ssh/id_ed25519");
    expect(guard.audit()[0]?.target?.startsWith("~")).toBe(false);
  });

  it("records the role id and the canonical path on an allowed call", () => {
    const guard = harness(options(), { kind: "course", slug: "ctm" });
    const event: ToolCallEvent = {
      type: "tool_call",
      toolCallId: "9",
      toolName: "read",
      input: { path: "/vault/wiki/courses/ctm.md" },
    };
    expect(guard.call(event)).toBeUndefined();
    const [entry] = guard.audit();
    expect(entry?.role).toBe("course:ctm");
    expect(entry?.target).toBe("/vault/wiki/courses/ctm.md");
    expect(entry?.reason).toBe("");
  });

  it("audits a bash call, naming the command instead of a path", () => {
    const guard = harness(options());
    const event: ToolCallEvent = {
      type: "tool_call",
      toolCallId: "10",
      toolName: "bash",
      input: { command: "cat ~/.ssh/id_ed25519" },
    };
    const result = guard.call(event) as { block?: boolean } | undefined;
    expect(result?.block).toBe(true);
    expect(guard.audit()[0]?.target).toBe("cat ~/.ssh/id_ed25519");
    expect(guard.audit()[0]?.allow).toBe(false);
  });

  it("blocks a recursive search rooted at a credential's ancestor but lets `ls ~` through", () => {
    const guard = harness(options());
    const grepHome: ToolCallEvent = {
      type: "tool_call",
      toolCallId: "11",
      toolName: "grep",
      input: { pattern: "token", path: "~" },
    };
    const blocked = guard.call(grepHome) as { block?: boolean; reason?: string } | undefined;
    expect(blocked?.block).toBe(true);
    expect(blocked?.reason).toContain("凭据目录");
    expect(blocked?.reason).toContain("缩小搜索范围");

    // `ls` 只列一层，不递归：`ls ~` 放行（文件名级的凭据清单在 read 时生效）。
    const lsHome: ToolCallEvent = { type: "tool_call", toolCallId: "12", toolName: "ls", input: { path: "~" } };
    expect(guard.call(lsHome)).toBeUndefined();
    expect(guard.audit().at(-1)?.allow).toBe(true);

    // 缩小到不含凭据目录的子树后，grep 放行。
    const grepDownloads: ToolCallEvent = {
      type: "tool_call",
      toolCallId: "13",
      toolName: "grep",
      input: { pattern: "closure", path: "~/Downloads" },
    };
    expect(guard.call(grepDownloads)).toBeUndefined();
  });

  it("audits course_close with its action and slug/staging, not an empty target", () => {
    const guard = harness(options(), { kind: "course", slug: "discrete-math-epp" });
    const staging = "/home/learning/.close/discrete-math-epp-20261109-2300";
    const commit: ToolCallEvent = {
      type: "tool_call",
      toolCallId: "14",
      toolName: "course_close",
      input: { action: "commit", staging },
    };
    expect(guard.call(commit)).toBeUndefined();
    const [entry] = guard.audit();
    expect(entry?.tool).toBe("course_close");
    expect(entry?.role).toBe("course:discrete-math-epp");
    expect(entry?.allow).toBe(true);
    expect(entry?.target).toBe(`commit ${staging}`);

    // 只有 slug 的动作（stage / undo）用 slug 作 target；被拦的调用也记。
    const stage: ToolCallEvent = {
      type: "tool_call",
      toolCallId: "15",
      toolName: "course_close",
      input: { action: "stage", slug: "ctm" },
    };
    expect((guard.call(stage) as { block?: boolean } | undefined)?.block).toBe(true);
    expect(guard.audit().at(-1)?.target).toBe("stage ctm");
    expect(guard.audit().at(-1)?.allow).toBe(false);
  });
});

describe("createGuardExtension — course_plan 的审计 target（阶段 4a）", () => {
  it("audits course_plan as `<action> <slug>`, and `<action> <staging>` when it names a staging", () => {
    const guard = harness(options({}), { kind: "control" });
    const stage: ToolCallEvent = {
      type: "tool_call",
      toolCallId: "20",
      toolName: "course_plan",
      input: { action: "stage", slug: "ctm" },
    };
    expect(guard.call(stage)).toBeUndefined();
    const [entry] = guard.audit();
    expect(entry?.tool).toBe("course_plan");
    expect(entry?.role).toBe("control");
    expect(entry?.allow).toBe(true);
    expect(entry?.target).toBe("stage ctm");

    // 整理 1：staging 在 <workspace>/.close/ 里的调用放行，审计名暂存目录。
    const staging = "/home/learning/.close/ctm-20261110-101010";
    const check: ToolCallEvent = {
      type: "tool_call",
      toolCallId: "21",
      toolName: "course_plan",
      input: { action: "check", staging },
    };
    expect(guard.call(check)).toBeUndefined();
    expect(guard.audit().at(-1)?.target).toBe(`check ${staging}`);
  });

  it("blocks and audits course_plan from the course session", () => {
    const guard = harness(options({}), { kind: "course", slug: "discrete-math-epp" });
    const board: ToolCallEvent = {
      type: "tool_call",
      toolCallId: "22",
      toolName: "course_plan",
      input: { action: "board" },
    };
    const result = guard.call(board) as { block?: boolean; reason?: string } | undefined;
    expect(result?.block).toBe(true);
    expect(result?.reason).toContain("总控");
    const [entry] = guard.audit();
    expect(entry?.allow).toBe(false);
    expect(entry?.target).toBe("board");
  });
});

/**
 * 阶段 4a-2：沙盒接入后的 guard 行为（假 `SandboxRunner`，不跑真沙盒）。
 *
 * 真 seatbelt 的回归在 `../sandbox/sandbox.e2e.test.ts`；这里只钉住 guard 与
 * runner 之间的约定：命被改写进沙盒、审计记原命令、沙盒起不来就拒绝、出错结果
 * 补上违规原因，以及没接沙盒时行为与阶段 2/3 完全一样。
 */
interface FakeSandbox extends SandboxRunner {
  wraps: { command: string; commandId: string; role: SessionRole }[];
  annotates: { commandId: string; stderr: string }[];
}

function fakeSandbox(
  behaviour: { wrap?: (command: string) => Promise<string>; annotate?: (stderr: string) => string } = {},
): FakeSandbox {
  const wraps: FakeSandbox["wraps"] = [];
  const annotates: FakeSandbox["annotates"] = [];
  return {
    wraps,
    annotates,
    async wrap(command, commandId, role) {
      wraps.push({ command, commandId, role });
      if (behaviour.wrap) return behaviour.wrap(command);
      return `sandbox-exec -p '(version 1)' /bin/bash -c ${JSON.stringify(command)}`;
    },
    annotate(commandId, stderr) {
      annotates.push({ commandId, stderr });
      return behaviour.annotate ? behaviour.annotate(stderr) : `${stderr}\n<sandbox_violations>deny(1) file-write-create</sandbox_violations>`;
    },
    async reset() {},
  };
}

const bashEvent = (command: string, toolCallId = "30"): ToolCallEvent => ({
  type: "tool_call",
  toolCallId,
  toolName: "bash",
  input: { command },
});

describe("createGuardExtension — bash 进沙盒（阶段 4a）", () => {
  it("放行的 bash：命令被换成 wrap 的返回值，审计仍记原始命令", async () => {
    const sandbox = fakeSandbox();
    const guard = harness(options({ sandbox }));
    const event = bashEvent("echo hi > /vault/wiki/log.md");

    const verdict = await guard.call(event);
    expect(verdict).toBeUndefined();
    expect(event.input.command).toBe(
      `sandbox-exec -p '(version 1)' /bin/bash -c ${JSON.stringify("echo hi > /vault/wiki/log.md")}`,
    );
    expect(sandbox.wraps).toHaveLength(1);
    expect(sandbox.wraps[0]?.command).toBe("echo hi > /vault/wiki/log.md");
    expect(sandbox.wraps[0]?.commandId).toBe("30");
    // 角色按调用当时的那一个传给 runner。
    expect(sandbox.wraps[0]?.role).toEqual({ kind: "free" });

    const audit = guard.audit();
    expect(audit).toHaveLength(1);
    expect(audit[0]?.allow).toBe(true);
    expect(audit[0]?.target).toBe("echo hi > /vault/wiki/log.md");
  });

  it("被 guard 拒的 bash：wrap 一次都不调用", async () => {
    const sandbox = fakeSandbox();
    const guard = harness(options({ sandbox }));

    const verdict = (await guard.call(bashEvent("cat ~/.ssh/id_ed25519"))) as { block?: boolean } | undefined;
    expect(verdict?.block).toBe(true);
    expect(sandbox.wraps).toEqual([]);
    expect(guard.audit()).toHaveLength(1);
    expect(guard.audit()[0]?.allow).toBe(false);
  });

  it("wrap 抛错：拒绝这次调用（fail closed），原因含「沙盒启动失败」，并多记一行 allow:false", async () => {
    const sandbox = fakeSandbox({
      wrap: async () => {
        throw new Error("sandbox-exec 起不来");
      },
    });
    const guard = harness(options({ sandbox }));

    const verdict = (await guard.call(bashEvent("echo hi"))) as { block?: boolean; reason?: string } | undefined;
    expect(verdict?.block).toBe(true);
    expect(verdict?.reason).toContain("沙盒启动失败");
    expect(verdict?.reason).toContain("sandbox-exec 起不来");

    const audit = guard.audit();
    expect(audit).toHaveLength(2);
    // 第一行是清单判定的结果（放行），第二行是沙盒没能接手。
    expect(audit[0]?.allow).toBe(true);
    expect(audit[1]?.allow).toBe(false);
    expect(audit[1]?.target).toBe("echo hi");
    expect(audit[1]?.reason).toContain("沙盒启动失败");
  });

  it("wrap 把非 Error 的东西抛出来时也拒绝，不泄露成未处理异常", async () => {
    const sandbox = fakeSandbox({
      wrap: async () => {
        throw "字符串错误";
      },
    });
    const guard = harness(options({ sandbox }));
    const verdict = (await guard.call(bashEvent("echo hi"))) as { block?: boolean; reason?: string } | undefined;
    expect(verdict?.block).toBe(true);
    expect(verdict?.reason).toContain("字符串错误");
  });
});

describe("createGuardExtension — tool_result 的沙盒原因（阶段 4a）", () => {
  const errorResult = (toolName: string): ToolResultEvent => ({
    type: "tool_result",
    toolCallId: "31",
    toolName,
    input: { command: "echo hi > /vault/wiki/courses/x.md" },
    content: [
      { type: "text", text: "/bin/bash: Operation not permitted" },
      { type: "image", data: "AAAA", mimeType: "image/png" },
    ],
    isError: true,
  });

  it("bash 出错：第一段 text 被 annotate 换掉，其余 content 原样保留", () => {
    const sandbox = fakeSandbox();
    const guard = harness(options({ sandbox }));
    const event = errorResult("bash");

    const replaced = guard.result(event) as { content: { type: string; text?: string }[] } | undefined;
    expect(replaced?.content).toHaveLength(2);
    expect(replaced?.content[0]?.text).toContain("Operation not permitted");
    expect(replaced?.content[0]?.text).toContain("<sandbox_violations>");
    expect(replaced?.content[0]?.text).toContain("file-write-create");
    expect(replaced?.content[1]).toEqual({ type: "image", data: "AAAA", mimeType: "image/png" });
    // 传给 annotate 的是命令 id 与原始 stderr。
    expect(sandbox.annotates).toEqual([
      { commandId: "31", stderr: "/bin/bash: Operation not permitted" },
    ]);
    // 原事件不被就地改写（Pi 用返回值替换，事件本身留给后续 handler）。
    expect(event.content[0]).toEqual({ type: "text", text: "/bin/bash: Operation not permitted" });
  });

  it("bash 成功、非 bash 工具、或没接沙盒时都不改结果", () => {
    const sandbox = fakeSandbox();
    const guard = harness(options({ sandbox }));

    const success = { ...errorResult("bash"), isError: false };
    expect(guard.result(success)).toBeUndefined();

    const read = { ...errorResult("read"), toolName: "read" };
    expect(guard.result(read)).toBeUndefined();

    const noSandbox = harness(options());
    expect(noSandbox.result(errorResult("bash"))).toBeUndefined();

    expect(sandbox.annotates).toEqual([]);
  });

  it("没有 text 段（只有图片）时不动结果", () => {
    const sandbox = fakeSandbox();
    const guard = harness(options({ sandbox }));
    const event: ToolResultEvent = {
      type: "tool_result",
      toolCallId: "32",
      toolName: "bash",
      input: { command: "echo hi" },
      content: [{ type: "image", data: "AAAA", mimeType: "image/png" }],
      isError: true,
    };
    expect(guard.result(event)).toBeUndefined();
    expect(sandbox.annotates).toEqual([]);
  });
});

describe("createGuardExtension — 没接沙盒时与阶段 2/3 完全一样", () => {
  it("bash 命令不被改写、处理器同步返回（不是 Promise）", () => {
    const guard = harness(options());
    const event = bashEvent("echo hi");
    const verdict = guard.call(event);

    expect(verdict).toBeUndefined();
    expect(event.input.command).toBe("echo hi");
    // 同步：接沙盒的那条路径才返回 Promise。
    expect(verdict instanceof Promise).toBe(false);
  });
});
