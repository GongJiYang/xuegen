/**
 * The tool guard extension: blocking returns a reason, an allowed call gets its
 * `input.path` rewritten to the checked resolution, and every decision lands in
 * the audit log.
 *
 * A fake Pi API captures the `tool_call` handler, so this tests the extension's
 * own contract without a session or an SDK import at runtime.
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

interface Harness {
  call(event: ToolCallEvent): unknown;
  audit: () => AuditEntry[];
}

/** Build the extension and capture its `tool_call` handler. */
function harness(options: Omit<GuardOptions, "role" | "sessionId">, role: SessionRole = { kind: "free" }): Harness {
  let handler: ((event: ToolCallEvent) => unknown) | null = null;
  const factory = createGuardExtension({ ...options, role: () => role, sessionId: () => "session-1" });
  factory({
    on(name: string, callback: (event: ToolCallEvent) => unknown) {
      if (name === "tool_call") handler = callback;
      return () => {};
    },
  } as unknown as Parameters<typeof factory>[0]);
  return {
    call(event) {
      if (!handler) throw new Error("tool_call handler was not registered");
      return handler(event);
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
      input: { path: "/vault/Clippings/新文章.md", content: "x" },
    };
    expect(fresh.call(newClip)).toBeUndefined();

    const existingClip = harness(options({ exists: () => true }));
    const overwrite: ToolCallEvent = {
      type: "tool_call",
      toolCallId: "6",
      toolName: "write",
      input: { path: "/vault/Clippings/已有.md", content: "x" },
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

    const write = (): unknown =>
      handler?.({ type: "tool_call", toolCallId: "7", toolName: "write", input: { path: "/vault/wiki/courses/ctm.md" } });

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
  it("audits course_plan as `<action> <slug>`, and `<action>` alone when there is no slug", () => {
    const guard = harness(options({}), { kind: "control" });
    const schedule: ToolCallEvent = {
      type: "tool_call",
      toolCallId: "20",
      toolName: "course_plan",
      input: { action: "schedule", slug: "ctm", lessons: "/tmp/lessons.json" },
    };
    expect(guard.call(schedule)).toBeUndefined();
    const [entry] = guard.audit();
    expect(entry?.tool).toBe("course_plan");
    expect(entry?.role).toBe("control");
    expect(entry?.allow).toBe(true);
    expect(entry?.target).toBe("schedule ctm");

    // unlock 不带 slug（新建课程时只放开课程目录）：target 只有动作名。
    const unlock: ToolCallEvent = {
      type: "tool_call",
      toolCallId: "21",
      toolName: "course_plan",
      input: { action: "unlock" },
    };
    expect(guard.call(unlock)).toBeUndefined();
    expect(guard.audit().at(-1)?.target).toBe("unlock");
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
